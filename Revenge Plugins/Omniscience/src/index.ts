import { findByProps } from "../../compat";
import { showToast } from "../../shared/toast";
import { storage } from "@vendetta/plugin";
import { installPluginCrashGuard } from "../../shared/crashGuard";
import { getAssetIDByName } from "@vendetta/ui/assets";
import Settings from "./settings";
import { registerPluginSettingsShortcut } from "../../shared/pluginSettings";

const registerCrashGuard = () => installPluginCrashGuard("Omniscience", storage, {
  features: [
    { storageKey: "enabled", patterns: [/onMessage|MESSAGE_CREATE|track.?message|notification/i] },
    { storageKey: "showInSettings", patterns: [/registerPluginSettingsShortcut|pluginSettings/i] },
  ],
  fallbackKeys: ["enabled", "showInSettings"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();

const FluxDispatcher = findByProps("dispatch", "subscribe");
const ChannelStore = findByProps("getChannel");
const GuildStore = findByProps("getGuild");
const UserStore = findByProps("getUser", "getCurrentUser");
const RelationshipStore = findByProps("getFriendIDs");
const RestAPI = findByProps("get", "post", "del", "patch");

const defaults = {
  enabled: true,
  trackServers: true,
  trackGroups: true,
  trackDMs: true,
  exactMatch: false,
  wholeWords: true,
  caseSensitive: false,
  inSentence: true,
  sendNotificationToChannel: false,
  sendNotificationToWebhook: false,
  keywords: [],
  trackOwnMentions: false,
  targetChannelId: "",
  webhookUrl: "",
  trackMode: "everyone",
  customIds: "",
  ignoreBots: true,
  trackEmbeds: false,
  trackChannelsEnabled: false,
  trackedChannelIds: "",
  ignoreServersEnabled: false,
  ignoredServerIds: "",
  ignoreChannelsEnabled: false,
  ignoredChannelIds: "",
  ignoreUsersEnabled: false,
  ignoredUserIds: "",
  showInSettings: false
};

for (const [key, value] of Object.entries(defaults)) {
  if (storage[key] === undefined) storage[key] = value;
}
if (!Array.isArray(storage.keywords) || !storage.keywords.every((keyword: unknown) => typeof keyword === "string")) {
  console.warn("[Omniscience] Invalid saved keyword data was reset.");
  storage.keywords = [];
}
storage.keywords = [...new Set(storage.keywords.map((keyword: string) => keyword.trim()).filter(Boolean))];

let unsubMessage: (() => void) | null = null;
let unregisterSettingsShortcut: (() => void) | undefined;

export default {
  onLoad() {
    removeCrashGuard ??= registerCrashGuard();
  unregisterSettingsShortcut = registerPluginSettingsShortcut({
    id: "omniscience",
    title: "Omniscience",
    icon: "ChatCheckIcon",
    page: Settings,
    visible: storage.showInSettings === true,
  });

    const onMessage = (p: any) => {
      if (!storage.enabled) return;
      const m = p?.message ?? p;
      if (!m) return;

      let fullContent = m.content || "";

      if (storage.trackEmbeds && m.embeds && Array.isArray(m.embeds)) {
        for (const embed of m.embeds) {
          if (embed.title) fullContent += " " + embed.title;
          if (embed.description) fullContent += " " + embed.description;
          if (embed.fields && Array.isArray(embed.fields)) {
            for (const f of embed.fields) {
              if (f.name) fullContent += " " + f.name;
              if (f.value) fullContent += " " + f.value;
            }
          }
        }
      }

      if (!fullContent && !storage.trackOwnMentions) return;
      if (typeof m.author?.id !== "string") return;

      const currentUser = UserStore?.getCurrentUser?.();
      if (m.author?.id === currentUser?.id) return;

      if (storage.ignoreBots && m.author?.bot) return;

      const authorId = m.author?.id;

      if (storage.ignoreUsersEnabled && storage.ignoredUserIds) {
        const ignoredUsersList = storage.ignoredUserIds.split(",").map((id: string) => id.trim());
        if (ignoredUsersList.includes(authorId)) return;
      }

      if (storage.trackMode === "friends") {
        const friends = RelationshipStore?.getFriendIDs?.();
        if (!Array.isArray(friends) || !friends.includes(authorId)) return;
      } else if (storage.trackMode === "custom") {
        const customList = storage.customIds.split(",").map((id: string) => id.trim());
        if (!customList.includes(authorId)) return;
      }

      const channelId = m.channel_id ?? m.channelId ?? p?.channel_id ?? p?.channelId;
      if (!channelId) return;

      const channel = ChannelStore?.getChannel?.(channelId) ?? m.channel ?? p?.channel;
      const guildId = channel?.guild_id ?? m.guild_id ?? m.guildId ?? p?.guild_id ?? p?.guildId;
      if (!channel && !guildId) return;

      const c = {
        ...channel,
        id: channel?.id ?? channelId,
        guild_id: guildId,
        type: channel?.type ?? m.channel_type ?? p?.channel_type ?? (guildId ? 0 : undefined)
      };

      if (storage.ignoreChannelsEnabled && storage.ignoredChannelIds) {
        const ignoredChannelsList = storage.ignoredChannelIds.split(",").map((id: string) => id.trim());
        if (ignoredChannelsList.includes(c.id)) return;
      }

      let isTrackedChannel = false;
      if (storage.trackChannelsEnabled && storage.trackedChannelIds) {
        const trackedChannelsList = storage.trackedChannelIds.split(",").map((id: string) => id.trim());
        if (trackedChannelsList.includes(c.id)) isTrackedChannel = true;
      }

      if (!isTrackedChannel) {
        if (c.guild_id && storage.ignoreServersEnabled && storage.ignoredServerIds) {
          const ignoredServersList = storage.ignoredServerIds.split(",").map((id: string) => id.trim());
          if (ignoredServersList.includes(c.guild_id)) return;
        }

        if (c.guild_id && !storage.trackServers) return;
        if (c.type === 3 && !storage.trackGroups) return;
        if ((c.type === 1 || (c.type === 0 && !c.guild_id)) && !storage.trackDMs) return;
      }

      const currentUserId = currentUser?.id;
      const mentionsCurrentUser = Boolean(
        storage.trackOwnMentions &&
        currentUserId &&
        Array.isArray(m.mentions) &&
        m.mentions.some((mention: unknown) =>
          typeof mention === "string"
            ? mention === currentUserId
            : typeof mention === "object" &&
              mention !== null &&
              "id" in mention &&
              mention.id === currentUserId,
        ),
      );
      let matchedKeyword = mentionsCurrentUser ? "@you" : "";

      for (const storedKeyword of Array.isArray(storage.keywords) ? storage.keywords : []) {
        if (matchedKeyword) break;
        if (typeof storedKeyword !== "string") continue;
        const kw = storedKeyword.trim();
        if (!kw) continue;
        let content = fullContent;
        let testKw = kw;

        if (!storage.caseSensitive) {
          content = content.toLowerCase();
          testKw = testKw.toLowerCase();
        }

        let isMatch = false;
        if (storage.exactMatch) {
          isMatch = content === testKw;
        } else if (storage.wholeWords) {
          const regex = new RegExp(`\\b${testKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, storage.caseSensitive ? '' : 'i');
          isMatch = regex.test(content);
        } else if (storage.inSentence) {
          isMatch = content.includes(testKw);
        } else {
          const regex = new RegExp(`\\b${testKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, storage.caseSensitive ? '' : 'i');
          isMatch = regex.test(fullContent);
        }

        if (isMatch) {
          matchedKeyword = kw;
          break;
        }
      }

      if (!matchedKeyword) return;

      const author = m.author;
      const authorName = typeof author?.username === "string" ? author.username : "Unknown user";

      const sendToChannel = storage.sendNotificationToChannel && storage.targetChannelId;
      const sendToWebhook = storage.sendNotificationToWebhook && storage.webhookUrl;

      if (sendToChannel || sendToWebhook) {
        let messageContent = `# **Keyword Detected!**\n\n`;
        messageContent += `**User:** <@${author.id}>\n`;
        messageContent += `    Username: \`@${authorName}\`\n`;
        messageContent += `    ID: \`${author.id}\`\n`;
        messageContent += `**Keyword:** \`${matchedKeyword}\`\n`;
        messageContent += `**Message:**\n${m.content || "[Embed Message]"}\n`;

        if (c.guild_id) {
          const g = GuildStore?.getGuild?.(c.guild_id);
          messageContent += `**Location:** Server\n`;
          messageContent += `**Server:**\n`;
          messageContent += `    Name: \`${g?.name}\`\n`;
          messageContent += `    ID: \`${c.guild_id}\`\n`;
          messageContent += `**Channel:** <#${c.id}>\n`;
          messageContent += `    Name: \`${c.name}\`\n`;
          messageContent += `    ID: \`${c.id}\`\n`;
          messageContent += `**Message Link:** https://discord.com/channels/${c.guild_id}/${c.id}/${m.id}`;
        } else if (c.type === 3) {
          messageContent += `**Location:** Group\n`;
          messageContent += `**Group:** <#${c.id}>\n`;
          messageContent += `    Name: \`${c.name || 'Unnamed Group'}\`\n`;
          messageContent += `    ID: \`${c.id}\`\n`;
          messageContent += `**Message Link:** https://discord.com/channels/@me/${c.id}/${m.id}`;
        } else {
          messageContent += `**Location:** DM\n`;
          messageContent += `**Message Link:** https://discord.com/channels/@me/${c.id}/${m.id}`;
        }

        const notificationContent = currentUserId
          ? `<@${currentUserId}>\n${messageContent}`
          : messageContent;
        const allowedMentions = currentUserId
          ? { users: [currentUserId] }
          : { parse: [] };

        if (sendToChannel) {
          if (typeof RestAPI?.post !== "function") {
            console.warn("[Omniscience] Discord's REST module is unavailable; channel notifications cannot be sent.");
          } else {
            void RestAPI.post({
              url: `/channels/${storage.targetChannelId.trim()}/messages`,
              body: {
                content: notificationContent,
                allowed_mentions: allowedMentions
              }
            }).catch((error: unknown) => {
              console.error("[Omniscience] Could not send the channel notification.", error);
            });
          }
        }

        if (sendToWebhook) {
          if (typeof fetch !== "function") {
            console.error("[Omniscience] Fetch is unavailable; webhook notifications cannot be sent.");
          } else {
            void fetch(storage.webhookUrl.trim(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: notificationContent,
              allowed_mentions: allowedMentions
            })
            }).then((response) => {
              if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
            }).catch((error: unknown) => {
              console.error("[Omniscience] Could not send the webhook notification.", error);
            });
          }
        }

        showToast(`Omniscience detected a tracked message from ${authorName}.`);
      } else {
        let locationStr = "a direct message";
        if (c.guild_id) {
          const g = GuildStore?.getGuild?.(c.guild_id);
          locationStr = `${c.name ? `#${c.name}` : "a server channel"} in ${g?.name ?? "a server"}`;
        } else if (c.type === 3) {
          locationStr = `the group “${c.name || "Unnamed Group"}”`;
        }
        showToast(`Omniscience detected “${matchedKeyword}” from ${authorName} in ${locationStr}.`);
      }
    };

    if (typeof FluxDispatcher?.subscribe === "function" && typeof FluxDispatcher?.unsubscribe === "function") {
      FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
      unsubMessage = () => FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
    } else {
      console.warn("[Omniscience] Discord's message dispatcher was not found; message tracking is unavailable.");
    }
  },

  onUnload() {
    removeCrashGuard?.();
    removeCrashGuard = undefined;
    unsubMessage?.();
    unregisterSettingsShortcut?.();
    unregisterSettingsShortcut = undefined;
  },

  settings: Settings,
};
