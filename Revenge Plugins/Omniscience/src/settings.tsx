import { NavigationNative, React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps } from "../../compat";
import { showToast } from "../../shared/toast";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import StableTextInput from "../../StableTextInput";
import { PluginSettingsSection } from "../../shared/pluginSettings";
import {
  clearDeletedMessageHistory,
  clearMessageLoggerCache,
  setEditHistoryEnabled,
  setMessageLoggerKeepAfterRestart,
  setMessageLoggerLimit,
} from "./chatLogger";
import {
  clearMessageHistory,
  setMessageHistoryFeatureEnabled,
  updateMessageHistorySettings,
} from "./messageHistory";
import { setServerInfoFeatureEnabled } from "./serverInfo";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, TableSwitchRow, Stack } = findByProps(
  "TableSwitchRow",
  "TableRowGroup",
  "Stack",
  "TableRow"
);
const { Text } = findByProps("Text", "View");
const { Clipboard } = RN;
const inputStyle = {
  color: "#f2f3f5",
  backgroundColor: "#1e1f22",
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
};
const MESSAGE_LOG_LIMITS = [100, 512, 1000, 5000];

export function WordTrackerSettings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [newKeyword, setNewKeyword] = React.useState("");
  const [keywordInputReset, setKeywordInputReset] = React.useState(0);

  const addKeyword = () => {
    if (!newKeyword.trim()) {
      showToast("Enter a keyword before adding it.", getAssetIDByName("Small"));
      return;
    }

    const kw = newKeyword.trim();
    if (!storage.keywords.includes(kw)) {
      storage.keywords = [...storage.keywords, kw];
      setNewKeyword("");
      setKeywordInputReset((current) => current + 1);
      forceUpdate();
      showToast(`Added “${kw}” to keyword tracking.`, getAssetIDByName("Check"));
    } else {
      showToast(`“${kw}” is already in your keyword list.`, getAssetIDByName("Warning"));
    }
  };

  const removeKeyword = (kw: string) => {
    storage.keywords = storage.keywords.filter((k: string) => k !== kw);
    forceUpdate();
    showToast(`Removed “${kw}” from keyword tracking.`, getAssetIDByName("Check"));
  };

  const exportKeywords = () => {
    Clipboard.setString(JSON.stringify(storage.keywords));
    showToast("Exported your keywords to the clipboard.", getAssetIDByName("Check"));
  };

  const importKeywords = async () => {
    let text: string;
    try {
      text = await Clipboard.getString();
    } catch (error) {
      console.error("[Omniscience] Could not read keywords from the clipboard.", error);
      showToast("Could not read keyword data from the clipboard.", getAssetIDByName("Warning"));
      return;
    }

    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.every((keyword) => typeof keyword === "string")) {
        showToast("Could not import keywords. The clipboard must contain a JSON array of strings.", getAssetIDByName("Warning"));
        return;
      }
      storage.keywords = [...new Set(parsed.map((keyword: string) => keyword.trim()).filter(Boolean))];
      forceUpdate();
      showToast("Imported the keyword list from the clipboard.", getAssetIDByName("Check"));
    } catch (error) {
      console.warn("[Omniscience] Clipboard content is not a valid keyword list.", error);
      showToast("Could not import keywords because the clipboard does not contain valid JSON.", getAssetIDByName("Warning"));
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>

        <TableRowGroup title="Keyword Monitoring">
          <TableSwitchRow
            label="Enable Word Tracker"
            subLabel="Turn message keyword monitoring on or off."
            disabled={storage.enabled === false}
            value={storage.wordTrackerEnabled !== false}
            onValueChange={(v: boolean) => { storage.wordTrackerEnabled = v; forceUpdate(); }}
          />
        </TableRowGroup>

        <TableRowGroup title="Add Keyword">
          <Stack spacing={4}>
            <RN.View style={{ flexDirection: "row", alignItems: "center" }}>
              <StableTextInput
                placeholder="Enter a keyword or phrase."
                value={newKeyword}
                onChangeText={setNewKeyword}
                resetKey={keywordInputReset}
                onSubmitEditing={addKeyword}
                returnKeyType="done"
                style={{ ...inputStyle, flex: 1 }}
              />
              {newKeyword.length > 0 && (
                <RN.TouchableOpacity
                  accessibilityLabel="Clear keyword"
                  accessibilityRole="button"
                  onPress={() => {
                    setNewKeyword("");
                    setKeywordInputReset((current) => current + 1);
                  }}
                  style={{ padding: 10 }}
                >
                  <Text style={{ color: "#b5bac1" }}>Clear</Text>
                </RN.TouchableOpacity>
              )}
            </RN.View>
          </Stack>
        </TableRowGroup>

        <TableRowGroup>
          <TableRow
            label="Add Keyword"
            subLabel="Add the typed word or phrase to your tracking list."
            trailing={<TableRow.Arrow />}
            onPress={addKeyword}
          />
        </TableRowGroup>

        {storage.keywords && storage.keywords.length > 0 && (
          <TableRowGroup title="Tracked Keywords">
            {storage.keywords.map((kw: string, index: number) => (
              <TableRow
                key={index}
                label={kw}
                trailing={
                  <RN.TouchableOpacity
                    onPress={() => removeKeyword(kw)}
                    style={{
                      padding: 8,
                      backgroundColor: "#ff4d4d",
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <RN.Image
                      source={getAssetIDByName("TrashIcon")}
                      style={{ width: 14, height: 14, tintColor: "#ffffff" }}
                    />
                  </RN.TouchableOpacity>
                }
              />
            ))}
          </TableRowGroup>
        )}

        <TableRowGroup title="Data Management">
          <TableRow
            label="Export JSON"
            subLabel="Copy your keyword list to the clipboard."
            trailing={<TableRow.Arrow />}
            onPress={exportKeywords}
          />
          <TableRow
            label="Import JSON"
            subLabel="Import a JSON array of keywords from your clipboard."
            trailing={<TableRow.Arrow />}
            onPress={importKeywords}
          />
        </TableRowGroup>

        <TableRowGroup title="Tracking Target">
          <TableSwitchRow
            label="Track Mentions of This Account"
            subLabel="Notify when an incoming message mentions the currently active Discord account. Inactive saved accounts are not monitored."
            value={Boolean(storage.trackOwnMentions)}
            onValueChange={(v: boolean) => { storage.trackOwnMentions = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Everyone"
            subLabel="Track messages from all users."
            value={storage.trackMode === "everyone"}
            onValueChange={() => { storage.trackMode = "everyone"; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Friends Only"
            subLabel="Track messages sent by your friends."
            value={storage.trackMode === "friends"}
            onValueChange={() => { storage.trackMode = "friends"; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Custom Users"
            subLabel="Track messages from specific user IDs."
            value={storage.trackMode === "custom"}
            onValueChange={() => { storage.trackMode = "custom"; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Ignore Bots"
            subLabel="Skip messages sent by Discord bots."
            value={storage.ignoreBots}
            onValueChange={(v: boolean) => {
              storage.ignoreBots = v;
              if (v) storage.trackEmbeds = false;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track Embeds"
            subLabel="Include text in message embeds."
            value={storage.trackEmbeds}
            onValueChange={(v: boolean) => {
              storage.trackEmbeds = v;
              if (v) storage.ignoreBots = false;
              forceUpdate();
            }}
          />
        </TableRowGroup>

        {storage.trackMode === "custom" && (
          <TableRowGroup title="Custom User IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="customIds"
                placeholder="Enter comma-separated user IDs."
                value={String(storage.customIds ?? "")}
                onChangeText={(value: string) => { storage.customIds = value; }}
                style={inputStyle}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Tracking Locations">
          <TableSwitchRow
            label="Track Servers"
            subLabel="Monitor messages sent in servers."
            value={storage.trackServers}
            onValueChange={(v: boolean) => {
              storage.trackServers = v;
              if (!v) storage.ignoreServersEnabled = false;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track Group DMs"
            subLabel="Monitor messages sent in group DMs."
            value={storage.trackGroups}
            onValueChange={(v: boolean) => { storage.trackGroups = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track DMs"
            subLabel="Monitor messages sent in direct messages."
            value={storage.trackDMs}
            onValueChange={(v: boolean) => { storage.trackDMs = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Track Channels"
            subLabel="Track selected channels even when their server is ignored."
            value={storage.trackChannelsEnabled}
            onValueChange={(v: boolean) => { storage.trackChannelsEnabled = v; forceUpdate(); }}
          />
        </TableRowGroup>

        {storage.trackChannelsEnabled && (
          <TableRowGroup title="Tracked Channel IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="trackedChannelIds"
                placeholder="Enter comma-separated channel IDs."
                value={String(storage.trackedChannelIds ?? "")}
                onChangeText={(value: string) => { storage.trackedChannelIds = value; }}
                style={inputStyle}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Ignoring">
          <TableSwitchRow
            label="Ignore Servers"
            subLabel="Skip messages from selected servers."
            value={storage.ignoreServersEnabled}
            onValueChange={(v: boolean) => {
              storage.ignoreServersEnabled = v;
              if (v) storage.trackServers = true;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Ignore Channels"
            subLabel="Skip messages from selected channels, DMs, or groups."
            value={storage.ignoreChannelsEnabled}
            onValueChange={(v: boolean) => { storage.ignoreChannelsEnabled = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Ignore Users"
            subLabel="Skip messages from selected users."
            value={storage.ignoreUsersEnabled}
            onValueChange={(v: boolean) => { storage.ignoreUsersEnabled = v; forceUpdate(); }}
          />
        </TableRowGroup>

        {storage.ignoreServersEnabled && (
          <TableRowGroup title="Ignored Server IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="ignoredServerIds"
                placeholder="Enter comma-separated server IDs."
                value={String(storage.ignoredServerIds ?? "")}
                onChangeText={(value: string) => { storage.ignoredServerIds = value; }}
                style={{ color: "#f2f3f5", backgroundColor: "#1e1f22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </Stack>
          </TableRowGroup>
        )}

        {storage.ignoreChannelsEnabled && (
          <TableRowGroup title="Ignored Channel IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="ignoredChannelIds"
                placeholder="Enter comma-separated channel IDs."
                value={String(storage.ignoredChannelIds ?? "")}
                onChangeText={(value: string) => { storage.ignoredChannelIds = value; }}
                style={{ color: "#f2f3f5", backgroundColor: "#1e1f22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </Stack>
          </TableRowGroup>
        )}

        {storage.ignoreUsersEnabled && (
          <TableRowGroup title="Ignored User IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="ignoredUserIds"
                placeholder="Enter comma-separated user IDs."
                value={String(storage.ignoredUserIds ?? "")}
                onChangeText={(value: string) => { storage.ignoredUserIds = value; }}
                style={{ color: "#f2f3f5", backgroundColor: "#1e1f22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Matching Rules">
          <TableSwitchRow
            label="Match Whole Words"
            subLabel="Match the keyword as a separate word, not as part of another word."
            value={storage.wholeWords}
            onValueChange={(v: boolean) => { storage.wholeWords = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Exact Match"
            subLabel="Match only when the message text exactly equals the keyword."
            value={storage.exactMatch}
            onValueChange={(v: boolean) => { storage.exactMatch = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Case Sensitive"
            subLabel="Match the keyword's exact letter casing."
            value={storage.caseSensitive}
            onValueChange={(v: boolean) => { storage.caseSensitive = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Match Partial Words"
            subLabel="When exact and whole-word matching are off, match keywords inside longer words."
            value={storage.inSentence}
            onValueChange={(v: boolean) => { storage.inSentence = v; forceUpdate(); }}
          />
        </TableRowGroup>

        <TableRowGroup title="Advanced Notifications">
          <TableSwitchRow
            label="Send Notifications to a Channel"
            subLabel="Forward detected messages to a selected channel."
            value={storage.sendNotificationToChannel}
            onValueChange={(v: boolean) => { storage.sendNotificationToChannel = v; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Send Notifications to a Webhook"
            subLabel="Forward detected messages to a webhook."
            value={storage.sendNotificationToWebhook}
            onValueChange={(v: boolean) => { storage.sendNotificationToWebhook = v; forceUpdate(); }}
          />
        </TableRowGroup>

        {storage.sendNotificationToChannel && (
          <TableRowGroup title="Target Channel ID">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="targetChannelId"
                placeholder="Enter a channel ID."
                value={String(storage.targetChannelId ?? "")}
                onChangeText={(value: string) => { storage.targetChannelId = value; }}
                style={{ color: "#f2f3f5", backgroundColor: "#1e1f22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
              />
              <Text style={{ color: "#f23f42", fontSize: 12, marginTop: 4, fontWeight: "bold" }}>
                Use a channel you control to keep alerts private and avoid sending unwanted messages.
              </Text>
            </Stack>
          </TableRowGroup>
        )}

        {storage.sendNotificationToWebhook && (
          <TableRowGroup title="Webhook URL">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="webhookUrl"
                placeholder="Enter a webhook URL."
                value={String(storage.webhookUrl ?? "")}
                onChangeText={(value: string) => { storage.webhookUrl = value; }}
                style={{ color: "#f2f3f5", backgroundColor: "#1e1f22", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </Stack>
          </TableRowGroup>
        )}

      </Stack>
    </ScrollView>
  );
}

function findStackNavigation(navigation: any) {
  let current = navigation;
  while (current) {
    if (typeof current.push === "function") return current;
    current = current.getParent?.();
  }
  return undefined;
}

function openSettingsPage(navigation: any, title: string, page: () => unknown) {
  const stackNavigation = findStackNavigation(navigation);
  if (typeof stackNavigation?.push !== "function") {
    showToast(`Could not open ${title} settings.`, getAssetIDByName("Warning"));
    return;
  }
  stackNavigation.push("VendettaCustomPage", {
    title,
    render: () => React.createElement(page),
  });
}

function DeletedMessagesPreview({ showHistory, deletedIndicatorText }: { showHistory: boolean; deletedIndicatorText: string }) {
  return (
    <RN.View style={{ marginHorizontal: 8, overflow: "hidden", borderRadius: 8, backgroundColor: "#1e1f22" }}>
      <RN.View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#3f4147" }}>
        <Text style={{ color: "#f2f3f5", fontWeight: "600" }}># general</Text>
      </RN.View>
      <RN.View style={{ flexDirection: "row", gap: 10, padding: 10 }}>
        <RN.View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#3ba55c", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#ffffff", fontWeight: "700" }}>A</Text>
        </RN.View>
        <RN.View style={{ flex: 1 }}>
          <RN.View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
            <Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Alex</Text>
            <Text style={{ color: "#949ba4", fontSize: 11 }}>Today at 4:01 PM</Text>
          </RN.View>
          {showHistory && ["See you at 6", "See you at 7"].map((version) => (
            <Text key={version} style={{ color: "#949ba4", textDecorationLine: "line-through" }}>{version}</Text>
          ))}
          <Text style={{ color: "#f2f3f5" }}>See you at 8 <Text style={{ color: "#949ba4" }}>(edited)</Text></Text>
        </RN.View>
      </RN.View>
      <RN.View style={{ flexDirection: "row", backgroundColor: "#f23f431a" }}>
        <RN.View style={{ width: 4, backgroundColor: "#f23f43" }} />
        <RN.View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 10, padding: 10 }}>
          <RN.View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#eb459e", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#ffffff", fontWeight: "700" }}>S</Text>
          </RN.View>
          <RN.View style={{ flex: 1, minWidth: 0 }}>
            <RN.View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
              <Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Sam</Text>
              <Text style={{ color: "#949ba4", fontSize: 11 }}>Today at 4:03 PM</Text>
            </RN.View>
            <Text style={{ color: "#f23f43", fontWeight: "600" }}>
              {deletedIndicatorText.trim() || "This message was deleted"}
            </Text>
          </RN.View>
        </RN.View>
      </RN.View>
    </RN.View>
  );
}

export function DirectMessageLoggerSettings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <TableRowGroup title="DM Logger">
          <TableSwitchRow
            label="Enable DM Logger"
            subLabel="Forward incoming direct and group DMs while Revenge is active. Message requests are included only when Discord delivers their messages to this client."
            value={Boolean(storage.dmLoggerEnabled)}
            onValueChange={(value: boolean) => { storage.dmLoggerEnabled = value; forceUpdate(); }}
          />
          <TableSwitchRow
            label="Send to a Channel"
            subLabel="Send DM logs to a channel you control."
            disabled={!storage.dmLoggerEnabled}
            value={Boolean(storage.dmLoggerSendToChannel)}
            onValueChange={(value: boolean) => {
              storage.dmLoggerSendToChannel = value;
              forceUpdate();
            }}
          />
          {storage.dmLoggerSendToChannel && (
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="dmLoggerChannelId"
                placeholder="Destination channel ID or link."
                value={String(storage.dmLoggerChannelId ?? "")}
                onChangeText={(value: string) => { storage.dmLoggerChannelId = value; }}
                style={inputStyle}
              />
            </Stack>
          )}
          <TableSwitchRow
            label="Send to a Webhook"
            subLabel="Send DM logs to a Discord webhook you control."
            disabled={!storage.dmLoggerEnabled}
            value={Boolean(storage.dmLoggerSendToWebhook)}
            onValueChange={(value: boolean) => {
              storage.dmLoggerSendToWebhook = value;
              forceUpdate();
            }}
          />
          {storage.dmLoggerSendToWebhook && (
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="dmLoggerWebhookUrl"
                placeholder="Discord webhook URL."
                value={String(storage.dmLoggerWebhookUrl ?? "")}
                onChangeText={(value: string) => { storage.dmLoggerWebhookUrl = value; }}
                style={inputStyle}
              />
            </Stack>
          )}
        </TableRowGroup>

      </Stack>
    </ScrollView>
  );
}

export function DeletedMessagesSettings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
  const enabled = Boolean(storage.messageLoggerEnabled);
  const historyEnabled = Boolean(storage.enableMessageHistory);
  const keepAfterRestart = Boolean(storage.messageLoggerKeepAfterRestart);
  const deletedCount = Number(storage.messageLoggerDeletedCount) || 0;
  const editCount = Number(storage.messageLoggerEditCount) || 0;
  const limit = Number(storage.messageLoggerLimit) || 512;
  const limitIndex = Math.max(0, MESSAGE_LOG_LIMITS.indexOf(limit));
  const summary = deletedCount || editCount
    ? `${deletedCount} deleted message${deletedCount === 1 ? "" : "s"} and ${editCount} edit${editCount === 1 ? "" : "s"} kept${keepAfterRestart ? ", saved on this phone." : " until Discord restarts."}`
    : "No deleted messages or edits kept yet.";

  const changeLimit = (step: number) => {
    const nextIndex = Math.max(0, Math.min(MESSAGE_LOG_LIMITS.length - 1, limitIndex + step));
    setMessageLoggerLimit(MESSAGE_LOG_LIMITS[nextIndex]);
    forceUpdate();
  };

  const confirmClear = () => {
    RN.Alert.alert("Clear kept messages?", "Every locally kept deleted message and edit history will be removed. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          clearDeletedMessageHistory();
          showToast("Cleared kept messages and edit history.", getAssetIDByName("Check"));
          forceUpdate();
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <TableRowGroup title="Deleted Messages">
          <TableSwitchRow
            label="Enable Deleted Message Logger"
            subLabel="Keep a local history of deletions and edits observed while the logger is active."
            value={enabled}
            onValueChange={(value: boolean) => {
              storage.messageLoggerEnabled = value;
              if (!value) clearMessageLoggerCache();
              forceUpdate();
            }}
          />
        </TableRowGroup>

        <RN.View style={{ padding: 12, borderRadius: 8, backgroundColor: "#2b2d31" }}>
          <Text style={{ color: "#f2f3f5", fontWeight: "600" }}>{summary}</Text>
        </RN.View>

        <TableRowGroup title="Preview">
          <DeletedMessagesPreview
            showHistory={storage.keepEditHistory !== false}
            deletedIndicatorText={String(storage.deletedIndicatorText ?? "This message was deleted")}
          />
        </TableRowGroup>

        <TableRowGroup title="Edited Messages">
          <TableSwitchRow
            label="Show edit history"
            subLabel="Keep up to 10 earlier versions of each observed message."
            disabled={!enabled}
            value={storage.keepEditHistory !== false}
            onValueChange={(value: boolean) => {
              setEditHistoryEnabled(value);
              updateMessageHistorySettings({ keepEditHistory: value });
              forceUpdate();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Storage">
          <TableSwitchRow
            label="Keep after restarting"
            subLabel="Deleted and edited messages survive closing Discord. Saved only on this phone."
            disabled={!enabled}
            value={keepAfterRestart}
            onValueChange={(value: boolean) => {
              setMessageLoggerKeepAfterRestart(value);
              forceUpdate();
            }}
          />
          <RN.View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Keep up to</Text>
              <RN.View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <RN.TouchableOpacity accessibilityLabel="Decrease message limit" accessibilityRole="button" disabled={!enabled || limitIndex === 0} onPress={() => changeLimit(-1)}>
                  <Text style={{ color: !enabled || limitIndex === 0 ? "#6d6f78" : "#f2f3f5", fontSize: 20 }}>-</Text>
                </RN.TouchableOpacity>
                <Text style={{ color: "#f2f3f5", minWidth: 42, textAlign: "center" }}>{limit.toLocaleString()}</Text>
                <RN.TouchableOpacity accessibilityLabel="Increase message limit" accessibilityRole="button" disabled={!enabled || limitIndex === MESSAGE_LOG_LIMITS.length - 1} onPress={() => changeLimit(1)}>
                  <Text style={{ color: !enabled || limitIndex === MESSAGE_LOG_LIMITS.length - 1 ? "#6d6f78" : "#f2f3f5", fontSize: 20 }}>+</Text>
                </RN.TouchableOpacity>
              </RN.View>
            </RN.View>
            <Text style={{ color: "#949ba4", fontSize: 12, marginTop: 4 }}>When full, the oldest kept message is removed first.</Text>
          </RN.View>
        </TableRowGroup>

        {deletedCount + editCount > 0 && (
          <TableRowGroup title="Manage">
            <TableRow
              label="Clear kept messages"
              subLabel="Remove locally kept deleted messages and edit history."
              trailing={<TableRow.Arrow />}
              onPress={confirmClear}
            />
          </TableRowGroup>
        )}

        <TableRowGroup title="Log Delivery">
          <TableSwitchRow
            label="Send logs to a Channel"
            subLabel="Forward edit and deletion details to a separate channel you control."
            disabled={!enabled}
            value={Boolean(storage.messageLoggerSendToChannel)}
            onValueChange={(value: boolean) => { storage.messageLoggerSendToChannel = value; forceUpdate(); }}
          />
          <Stack spacing={4} style={{ padding: 10 }}>
            <StableTextInput
              key="messageLoggerSourceChannelId"
              placeholder="Channel to monitor: ID or link."
              value={String(storage.messageLoggerSourceChannelId ?? "")}
              editable={enabled}
              onChangeText={(value: string) => { storage.messageLoggerSourceChannelId = value; }}
              style={{ ...inputStyle, opacity: enabled ? 1 : 0.5 }}
            />
            {storage.messageLoggerSendToChannel && (
              <StableTextInput
                key="messageLoggerDestinationChannelId"
                placeholder="Log destination channel ID or link."
                value={String(storage.messageLoggerDestinationChannelId ?? "")}
                editable={enabled}
                onChangeText={(value: string) => { storage.messageLoggerDestinationChannelId = value; }}
                style={{ ...inputStyle, opacity: enabled ? 1 : 0.5 }}
              />
            )}
          </Stack>
          <TableSwitchRow
            label="Send logs to a Webhook"
            subLabel="Forward edit and deletion details to a Discord webhook you control."
            disabled={!enabled}
            value={Boolean(storage.messageLoggerSendToWebhook)}
            onValueChange={(value: boolean) => { storage.messageLoggerSendToWebhook = value; forceUpdate(); }}
          />
          {storage.messageLoggerSendToWebhook && (
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="messageLoggerWebhookUrl"
                placeholder="Message log Discord webhook URL."
                value={String(storage.messageLoggerWebhookUrl ?? "")}
                editable={enabled}
                onChangeText={(value: string) => { storage.messageLoggerWebhookUrl = value; }}
                style={{ ...inputStyle, opacity: enabled ? 1 : 0.5 }}
              />
            </Stack>
          )}
        </TableRowGroup>

        <TableRowGroup title="In-chat Message History">
          <TableSwitchRow
            label="Enable Message History"
            subLabel="Show deleted-message notices and temporary notices with earlier text after edits."
            value={historyEnabled}
            onValueChange={(value: boolean) => {
              storage.enableMessageHistory = value;
              setMessageHistoryFeatureEnabled(value && storage.enabled !== false);
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Log Deleted Messages"
            subLabel="Retain deleted messages in chat with the configured notice."
            disabled={!historyEnabled}
            value={Boolean(storage.keepDeletedMessages)}
            onValueChange={(value: boolean) => {
              storage.keepDeletedMessages = value;
              updateMessageHistorySettings({ keepDeletedMessages: value });
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Show edit history"
            subLabel="Show up to 10 earlier versions in a temporary notice; edits continue through Discord normally."
            disabled={!historyEnabled}
            value={storage.keepEditHistory !== false}
            onValueChange={(value: boolean) => {
              setEditHistoryEnabled(value);
              updateMessageHistorySettings({ keepEditHistory: value });
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Ignore Bot Messages"
            subLabel="Do not retain deletions or edits from bots."
            disabled={!historyEnabled}
            value={Boolean(storage.ignoreBotMessages)}
            onValueChange={(value: boolean) => {
              storage.ignoreBotMessages = value;
              updateMessageHistorySettings({ ignoreBotMessages: value });
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Ignore Your Messages"
            subLabel="Do not retain deletions or edits to your own messages."
            disabled={!historyEnabled}
            value={Boolean(storage.ignoreOwnMessages)}
            onValueChange={(value: boolean) => {
              storage.ignoreOwnMessages = value;
              updateMessageHistorySettings({ ignoreOwnMessages: value });
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Enable Ignored Users"
            subLabel="Skip users added from their profile menu."
            disabled={!historyEnabled}
            value={Boolean(storage.enableIgnoreUsers)}
            onValueChange={(value: boolean) => {
              storage.enableIgnoreUsers = value;
              updateMessageHistorySettings({ enableIgnoreUsers: value });
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Add Edit Timestamps"
            subLabel="Include a relative time in each temporary edit notice."
            disabled={!historyEnabled}
            value={Boolean(storage.timestampForEdits)}
            onValueChange={(value: boolean) => {
              storage.timestampForEdits = value;
              updateMessageHistorySettings({ timestampForEdits: value });
              forceUpdate();
            }}
          />
          <Stack spacing={4} style={{ padding: 10, opacity: historyEnabled ? 1 : 0.5 }}>
            <StableTextInput
              key="deletedIndicatorText"
              placeholder="This message was deleted"
              value={String(storage.deletedIndicatorText ?? "This message was deleted")}
              editable={historyEnabled}
              onChangeText={(value: string) => {
                storage.deletedIndicatorText = value;
                updateMessageHistorySettings({ deletedIndicatorText: value });
              }}
              style={inputStyle}
            />
          </Stack>
          <TableRow
            label={`Ignored Users (${Array.isArray(storage.messageHistoryIgnoredUserIds) ? storage.messageHistoryIgnoredUserIds.length : 0})`}
            subLabel="Add users from their profile menu; remove them here."
            disabled={!historyEnabled || !storage.enableIgnoreUsers}
          />
          {Array.isArray(storage.messageHistoryIgnoredUserIds) && storage.messageHistoryIgnoredUserIds.length > 0
            ? storage.messageHistoryIgnoredUserIds.map((userId: string) => (
              <TableRow
                key={userId}
                label={`User ${userId}`}
                disabled={!historyEnabled || !storage.enableIgnoreUsers}
                trailing={(
                  <RN.TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${userId} from message-history ignored users`}
                    disabled={!historyEnabled || !storage.enableIgnoreUsers}
                    onPress={() => {
                      if (!historyEnabled || !storage.enableIgnoreUsers) return;
                      const messageHistoryIgnoredUserIds = storage.messageHistoryIgnoredUserIds.filter((id: string) => id !== userId);
                      storage.messageHistoryIgnoredUserIds = messageHistoryIgnoredUserIds;
                      updateMessageHistorySettings({ ignoredUserIds: messageHistoryIgnoredUserIds });
                      forceUpdate();
                    }}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, opacity: historyEnabled && storage.enableIgnoreUsers ? 1 : 0.5 }}
                  >
                    <Text style={{ color: "#ed4245", fontWeight: "600" }}>Remove</Text>
                  </RN.TouchableOpacity>
                )}
              />
            ))
            : <TableRow label="No users are currently ignored." disabled={!historyEnabled || !storage.enableIgnoreUsers} />}
          <TableRow
            label="Clear in-chat history"
            subLabel="Forget retained edits and deleted-message records."
            disabled={!historyEnabled}
            trailing={<TableRow.Arrow />}
            onPress={() => {
              if (!historyEnabled) return;
              clearMessageHistory();
              clearDeletedMessageHistory();
              showToast("Cleared Omniscience message history.", getAssetIDByName("Check"));
              forceUpdate();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Server Info">
          <TableSwitchRow
            label="Enable Server Info"
            subLabel="Add a Server Info action to server icons in the server list."
            value={storage.enableServerInfo !== false}
            onValueChange={(value: boolean) => {
              storage.enableServerInfo = value;
              setServerInfoFeatureEnabled(value && storage.enabled !== false);
              forceUpdate();
            }}
          />
        </TableRowGroup>
      </Stack>
    </ScrollView>
  );
}

export default function Settings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
  const navigation = NavigationNative.useNavigation();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <TableRowGroup title="Omniscience">
          <TableSwitchRow
            label="Enable Omniscience"
            subLabel="Turn Word Tracker and all chat logging on or off."
            value={storage.enabled !== false}
            onValueChange={(value: boolean) => {
              storage.enabled = value;
              if (!value) clearMessageLoggerCache();
              setMessageHistoryFeatureEnabled(value && storage.enableMessageHistory !== false);
              setServerInfoFeatureEnabled(value && storage.enableServerInfo !== false);
              forceUpdate();
            }}
          />
          <TableRow
            label="Word Tracker"
            subLabel="Manage keywords, matching rules, tracking targets, and alert delivery."
            trailing={<TableRow.Arrow />}
            onPress={() => openSettingsPage(navigation, "Word Tracker", WordTrackerSettings)}
          />
          <TableRow
            label="Direct Message Logger"
            subLabel="Configure incoming direct and group DM logging."
            trailing={<TableRow.Arrow />}
            onPress={() => openSettingsPage(navigation, "Direct Message Logger", DirectMessageLoggerSettings)}
          />
          <TableRow
            label="Deleted Messages"
            subLabel="Keep deleted messages and edit history, with optional channel or webhook delivery."
            trailing={<TableRow.Arrow />}
            onPress={() => openSettingsPage(navigation, "Deleted Messages", DeletedMessagesSettings)}
          />
        </TableRowGroup>
        <PluginSettingsSection id="omniscience" />
      </Stack>
    </ScrollView>
  );
}
