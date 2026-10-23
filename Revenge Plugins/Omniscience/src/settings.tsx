import {
  NavigationNative,
  React,
  ReactNative as RN,
} from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByName, findByProps } from "../../compat";
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
  hasMessageHistory,
  setMessageHistoryFeatureEnabled,
  setMessageHistoryLimit,
  setMessageHistoryPersistenceEnabled,
  updateMessageHistorySettings,
} from "./messageHistory";
import { setServerInfoFeatureEnabled } from "./serverInfo";
import { setMessageHighlightOptions } from "./messageHighlights";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, TableSwitchRow, Stack } = findByProps(
  "TableSwitchRow",
  "TableRowGroup",
  "Stack",
  "TableRow",
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
const MESSAGE_LOG_LIMITS = [100, 500, 1000, 5000];
const HIGHLIGHT_THICKNESSES = [1, 2, 3, 4];
const HIGHLIGHT_PING_CHOICES = [
  ["default", "Yellow", "#f0b232"],
  ["blurple", "Blurple", "#5865f2"],
  ["cyan", "Cyan", "#00a8fc"],
  ["green", "Green", "#23a55a"],
  ["pink", "Pink", "#eb459e"],
  ["purple", "Purple", "#9b59b6"],
] as const;
const HIGHLIGHT_DELETED_CHOICES = [
  ["default", "Red", "#f23f43"],
  ["orange", "Orange", "#e67e22"],
  ["yellow", "Yellow", "#f0b232"],
  ["pink", "Pink", "#eb459e"],
  ["purple", "Purple", "#9b59b6"],
  ["cyan", "Cyan", "#00a8fc"],
] as const;

type HighlightChoice = readonly [string, string, string];
type HighlightColorSetting =
  | "messageHighlightPingColor"
  | "messageHighlightDeletedColor";

function getHighlightColor(
  value: unknown,
  choices: readonly HighlightChoice[],
  fallback: string,
) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return choices.find(([key]) => key === normalized)?.[2] ?? fallback;
}

function syncMessageHighlightOptions() {
  setMessageHighlightOptions({
    enabled:
      storage.enabled !== false && storage.messageHighlightEnabled !== false,
    deletedEnabled:
      storage.enabled !== false && storage.keepDeletedMessages !== false,
    historyEnabled:
      storage.enabled !== false &&
      storage.keepDeletedMessages !== false &&
      storage.keepEditHistory !== false,
    thickness: Number(storage.messageHighlightThickness) || 2,
    pingColor: String(storage.messageHighlightPingColor ?? "default"),
    deletedColor: String(storage.messageHighlightDeletedColor ?? "default"),
  });
}

function showHighlightColorPicker(
  currentColor: string,
  choices: readonly HighlightChoice[],
  onSelect: (color: string) => void,
) {
  const module = findByName("showCustomColorPickerActionSheet", false);
  const showPicker =
    module?.default ?? module?.showCustomColorPickerActionSheet ?? module;
  if (typeof showPicker !== "function") return false;

  try {
    showPicker({
      color: parseInt(currentColor.slice(1), 16),
      suggestedColors: choices.map(([, , color]) =>
        parseInt(color.slice(1), 16),
      ),
      onSelect: (value: unknown) => {
        const color =
          typeof value === "number"
            ? `#${(Math.trunc(value) & 0xffffff).toString(16).padStart(6, "0")}`
            : typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
              ? value.toLowerCase()
              : undefined;
        if (color) onSelect(color);
      },
    });
    return true;
  } catch (error) {
    console.warn(
      "[Omniscience] Discord's color picker could not be opened.",
      error,
    );
    return false;
  }
}

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
      showToast(
        `Added “${kw}” to keyword tracking.`,
        getAssetIDByName("Check"),
      );
    } else {
      showToast(
        `“${kw}” is already in your keyword list.`,
        getAssetIDByName("Warning"),
      );
    }
  };

  const removeKeyword = (kw: string) => {
    storage.keywords = storage.keywords.filter((k: string) => k !== kw);
    forceUpdate();
    showToast(
      `Removed “${kw}” from keyword tracking.`,
      getAssetIDByName("Check"),
    );
  };

  const exportKeywords = () => {
    Clipboard.setString(JSON.stringify(storage.keywords));
    showToast(
      "Exported your keywords to the clipboard.",
      getAssetIDByName("Check"),
    );
  };

  const importKeywords = async () => {
    let text: string;
    try {
      text = await Clipboard.getString();
    } catch (error) {
      console.error(
        "[Omniscience] Could not read keywords from the clipboard.",
        error,
      );
      showToast(
        "Could not read keyword data from the clipboard.",
        getAssetIDByName("Warning"),
      );
      return;
    }

    try {
      const parsed: unknown = JSON.parse(text);
      if (
        !Array.isArray(parsed) ||
        !parsed.every((keyword) => typeof keyword === "string")
      ) {
        showToast(
          "Could not import keywords. The clipboard must contain a JSON array of strings.",
          getAssetIDByName("Warning"),
        );
        return;
      }
      storage.keywords = [
        ...new Set(
          parsed.map((keyword: string) => keyword.trim()).filter(Boolean),
        ),
      ];
      forceUpdate();
      showToast(
        "Imported the keyword list from the clipboard.",
        getAssetIDByName("Check"),
      );
    } catch (error) {
      console.warn(
        "[Omniscience] Clipboard content is not a valid keyword list.",
        error,
      );
      showToast(
        "Could not import keywords because the clipboard does not contain valid JSON.",
        getAssetIDByName("Warning"),
      );
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
            onValueChange={(v: boolean) => {
              storage.wordTrackerEnabled = v;
              forceUpdate();
            }}
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
            onValueChange={(v: boolean) => {
              storage.trackOwnMentions = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track Everyone"
            subLabel="Track messages from all users."
            value={storage.trackMode === "everyone"}
            onValueChange={() => {
              storage.trackMode = "everyone";
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track Friends Only"
            subLabel="Track messages sent by your friends."
            value={storage.trackMode === "friends"}
            onValueChange={() => {
              storage.trackMode = "friends";
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track Custom Users"
            subLabel="Track messages from specific user IDs."
            value={storage.trackMode === "custom"}
            onValueChange={() => {
              storage.trackMode = "custom";
              forceUpdate();
            }}
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
                onChangeText={(value: string) => {
                  storage.customIds = value;
                }}
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
            onValueChange={(v: boolean) => {
              storage.trackGroups = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track DMs"
            subLabel="Monitor messages sent in direct messages."
            value={storage.trackDMs}
            onValueChange={(v: boolean) => {
              storage.trackDMs = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Track Channels"
            subLabel="Track selected channels even when their server is ignored."
            value={storage.trackChannelsEnabled}
            onValueChange={(v: boolean) => {
              storage.trackChannelsEnabled = v;
              forceUpdate();
            }}
          />
        </TableRowGroup>

        {storage.trackChannelsEnabled && (
          <TableRowGroup title="Tracked Channel IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="trackedChannelIds"
                placeholder="Enter comma-separated channel IDs."
                value={String(storage.trackedChannelIds ?? "")}
                onChangeText={(value: string) => {
                  storage.trackedChannelIds = value;
                }}
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
            onValueChange={(v: boolean) => {
              storage.ignoreChannelsEnabled = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Ignore Users"
            subLabel="Skip messages from selected users."
            value={storage.ignoreUsersEnabled}
            onValueChange={(v: boolean) => {
              storage.ignoreUsersEnabled = v;
              forceUpdate();
            }}
          />
        </TableRowGroup>

        {storage.ignoreServersEnabled && (
          <TableRowGroup title="Ignored Server IDs">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="ignoredServerIds"
                placeholder="Enter comma-separated server IDs."
                value={String(storage.ignoredServerIds ?? "")}
                onChangeText={(value: string) => {
                  storage.ignoredServerIds = value;
                }}
                style={{
                  color: "#f2f3f5",
                  backgroundColor: "#1e1f22",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
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
                onChangeText={(value: string) => {
                  storage.ignoredChannelIds = value;
                }}
                style={{
                  color: "#f2f3f5",
                  backgroundColor: "#1e1f22",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
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
                onChangeText={(value: string) => {
                  storage.ignoredUserIds = value;
                }}
                style={{
                  color: "#f2f3f5",
                  backgroundColor: "#1e1f22",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
            </Stack>
          </TableRowGroup>
        )}

        <TableRowGroup title="Matching Rules">
          <TableSwitchRow
            label="Match Whole Words"
            subLabel="Match the keyword as a separate word, not as part of another word."
            value={storage.wholeWords}
            onValueChange={(v: boolean) => {
              storage.wholeWords = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Exact Match"
            subLabel="Match only when the message text exactly equals the keyword."
            value={storage.exactMatch}
            onValueChange={(v: boolean) => {
              storage.exactMatch = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Case Sensitive"
            subLabel="Match the keyword's exact letter casing."
            value={storage.caseSensitive}
            onValueChange={(v: boolean) => {
              storage.caseSensitive = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Match Partial Words"
            subLabel="When exact and whole-word matching are off, match keywords inside longer words."
            value={storage.inSentence}
            onValueChange={(v: boolean) => {
              storage.inSentence = v;
              forceUpdate();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Advanced Notifications">
          <TableSwitchRow
            label="Send Notifications to a Channel"
            subLabel="Forward detected messages to a selected channel."
            value={storage.sendNotificationToChannel}
            onValueChange={(v: boolean) => {
              storage.sendNotificationToChannel = v;
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Send Notifications to a Webhook"
            subLabel="Forward detected messages to a webhook."
            value={storage.sendNotificationToWebhook}
            onValueChange={(v: boolean) => {
              storage.sendNotificationToWebhook = v;
              forceUpdate();
            }}
          />
        </TableRowGroup>

        {storage.sendNotificationToChannel && (
          <TableRowGroup title="Target Channel ID">
            <Stack spacing={4} style={{ padding: 10 }}>
              <StableTextInput
                key="targetChannelId"
                placeholder="Enter a channel ID."
                value={String(storage.targetChannelId ?? "")}
                onChangeText={(value: string) => {
                  storage.targetChannelId = value;
                }}
                style={{
                  color: "#f2f3f5",
                  backgroundColor: "#1e1f22",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
              <Text
                style={{
                  color: "#f23f42",
                  fontSize: 12,
                  marginTop: 4,
                  fontWeight: "bold",
                }}
              >
                Use a channel you control to keep alerts private and avoid
                sending unwanted messages.
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
                onChangeText={(value: string) => {
                  storage.webhookUrl = value;
                }}
                style={{
                  color: "#f2f3f5",
                  backgroundColor: "#1e1f22",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
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

function PreviewIcon({ asset, fallback }: { asset: string; fallback: string }) {
  const source = getAssetIDByName(asset);
  return source ? (
    <RN.Image
      source={source}
      style={{ width: 18, height: 18, tintColor: "#b5bac1" }}
    />
  ) : (
    <Text style={{ color: "#b5bac1", fontSize: 18, fontWeight: "600" }}>
      {fallback}
    </Text>
  );
}

function useReducedMotion() {
  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    const accessibility = RN.AccessibilityInfo;
    if (typeof accessibility?.isReduceMotionEnabled === "function") {
      void Promise.resolve(accessibility.isReduceMotionEnabled())
        .then((enabled: boolean) => {
          if (active) setReduceMotion(enabled);
        })
        .catch(() => {});
    }
    const subscription = accessibility?.addEventListener?.(
      "reduceMotionChanged",
      (enabled: boolean) => {
        if (active) setReduceMotion(enabled);
      },
    );
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return reduceMotion;
}

function PreviewPopIn({
  children,
  reduceMotion,
}: {
  children: unknown;
  reduceMotion: boolean;
}) {
  const Animated = RN.Animated;
  const value = React.useRef<any>(null);
  if (!value.current && typeof Animated?.Value === "function") {
    value.current = new Animated.Value(reduceMotion ? 1 : 0);
  }
  React.useEffect(() => {
    const animatedValue = value.current;
    if (!animatedValue) return undefined;
    if (reduceMotion || typeof Animated.spring !== "function") {
      animatedValue.setValue(1);
      return undefined;
    }
    const animation = Animated.spring(animatedValue, {
      toValue: 1,
      speed: 20,
      bounciness: 12,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion]);

  if (!value.current || !Animated?.View) return <RN.View>{children}</RN.View>;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity: value.current.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
        transform: [
          {
            scale: value.current.interpolate({
              inputRange: [0, 1],
              outputRange: [0.4, 1],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function PreviewMessage({
  name,
  color,
  time,
  children,
}: {
  name: string;
  color: string;
  time: string;
  children: unknown;
}) {
  return (
    <RN.View
      style={{
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <RN.View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>
          {name.slice(0, 1).toUpperCase()}
        </Text>
      </RN.View>
      <RN.View style={{ flex: 1, minWidth: 0 }}>
        <RN.View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            marginBottom: 2,
          }}
        >
          <Text style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "600" }}>
            {name}
          </Text>
          <Text style={{ marginLeft: 8, color: "#949ba4", fontSize: 12 }}>
            {time}
          </Text>
        </RN.View>
        {children}
      </RN.View>
    </RN.View>
  );
}

function PreviewHeader() {
  return (
    <RN.View
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#ffffff14",
      }}
    >
      <Text style={{ width: 28, color: "#b5bac1", fontSize: 24 }}>‹</Text>
      <RN.View
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ color: "#949ba4", fontSize: 18 }}>#</Text>
        <Text style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "600" }}>
          general
        </Text>
        <Text style={{ color: "#80848e", fontSize: 16 }}>›</Text>
      </RN.View>
      <RN.View style={{ flexDirection: "row", gap: 8 }}>
        <RN.View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#2b2d31",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PreviewIcon asset="ThreadIcon" fallback="⋯" />
        </RN.View>
        <RN.View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#2b2d31",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PreviewIcon asset="MagnifyingGlassIcon" fallback="⌕" />
        </RN.View>
      </RN.View>
    </RN.View>
  );
}

function PreviewInput() {
  return (
    <RN.View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 9,
        borderTopWidth: 1,
        borderTopColor: "#ffffff0f",
        backgroundColor: "#232428",
      }}
    >
      <RN.View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2b2d31",
        }}
      >
        <PreviewIcon asset="PlusLargeIcon" fallback="+" />
      </RN.View>
      <RN.View
        style={{
          flex: 1,
          minHeight: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          borderRadius: 20,
          backgroundColor: "#2b2d31",
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: "#949ba4", fontSize: 14 }}
        >
          Message #general
        </Text>
        <PreviewIcon asset="GiftIcon" fallback="GIF" />
        <PreviewIcon asset="ReactionIcon" fallback="☺" />
      </RN.View>
      <RN.View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#2b2d31",
        }}
      >
        <PreviewIcon asset="MicrophoneIcon" fallback="◖" />
      </RN.View>
    </RN.View>
  );
}

function MessageLimitChoice({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const nearest = MESSAGE_LOG_LIMITS.reduce(
    (best, current) =>
      Math.abs(current - value) < Math.abs(best - value) ? current : best,
    MESSAGE_LOG_LIMITS[0],
  );
  const selectedIndex = MESSAGE_LOG_LIMITS.indexOf(nearest);
  const selection = React.useRef<any>(null);
  if (!selection.current && RN.Animated?.Value)
    selection.current = new RN.Animated.Value(selectedIndex);

  React.useEffect(() => {
    if (!selection.current) return;
    if (reduceMotion || typeof RN.Animated?.spring !== "function") {
      selection.current.setValue(selectedIndex);
      return;
    }
    const animation = RN.Animated.spring(selection.current, {
      toValue: selectedIndex,
      speed: 20,
      bounciness: 8,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [selectedIndex, reduceMotion]);

  const segmentWidth = width / MESSAGE_LOG_LIMITS.length;
  const indicatorStyle = selection.current
    ? {
        transform: [
          {
            translateX: selection.current.interpolate({
              inputRange: [0, MESSAGE_LOG_LIMITS.length - 1],
              outputRange: [0, Math.max(0, width - segmentWidth)],
            }),
          },
        ],
      }
    : { left: selectedIndex * segmentWidth };

  return (
    <RN.View>
      <RN.View
        onLayout={(event: any) => setWidth(event.nativeEvent.layout.width)}
        style={{
          position: "relative",
          flexDirection: "row",
          padding: 3,
          borderRadius: 16,
          backgroundColor: "#1e1f22",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <RN.Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 3,
              bottom: 3,
              width: segmentWidth,
              borderRadius: 13,
              backgroundColor: "#4e5058",
            },
            indicatorStyle,
          ]}
        />
        {MESSAGE_LOG_LIMITS.map((limit) => (
          <RN.TouchableOpacity
            key={limit}
            accessibilityRole="button"
            accessibilityState={{ selected: limit === nearest, disabled }}
            disabled={disabled}
            onPress={() => onChange(limit)}
            style={{
              flex: 1,
              minHeight: 34,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: limit === nearest ? "#ffffff" : "#b5bac1",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {limit}
            </Text>
          </RN.TouchableOpacity>
        ))}
      </RN.View>
      <Text style={{ marginTop: 6, color: "#949ba4", fontSize: 12 }}>
        When it’s full, the oldest message is removed first.
      </Text>
    </RN.View>
  );
}

function HighlightThicknessChoice({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const selectedIndex = Math.max(0, HIGHLIGHT_THICKNESSES.indexOf(value));
  const selection = React.useRef<any>(null);
  if (!selection.current && RN.Animated?.Value)
    selection.current = new RN.Animated.Value(selectedIndex);

  React.useEffect(() => {
    if (!selection.current) return;
    if (reduceMotion || typeof RN.Animated?.spring !== "function") {
      selection.current.setValue(selectedIndex);
      return;
    }
    const animation = RN.Animated.spring(selection.current, {
      toValue: selectedIndex,
      speed: 20,
      bounciness: 8,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [selectedIndex, reduceMotion]);

  const segmentWidth = width / HIGHLIGHT_THICKNESSES.length;
  const indicatorStyle = selection.current
    ? {
        transform: [
          {
            translateX: selection.current.interpolate({
              inputRange: [0, HIGHLIGHT_THICKNESSES.length - 1],
              outputRange: [0, Math.max(0, width - segmentWidth)],
            }),
          },
        ],
      }
    : { left: selectedIndex * segmentWidth };

  return (
    <RN.View
      onLayout={(event: any) => setWidth(event.nativeEvent.layout.width)}
      style={{
        position: "relative",
        flexDirection: "row",
        padding: 3,
        borderRadius: 16,
        backgroundColor: "#1e1f22",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <RN.Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 3,
            bottom: 3,
            width: segmentWidth,
            borderRadius: 13,
            backgroundColor: "#4e5058",
          },
          indicatorStyle,
        ]}
      />
      {HIGHLIGHT_THICKNESSES.map((thickness) => (
        <RN.TouchableOpacity
          key={thickness}
          accessibilityRole="button"
          accessibilityState={{ selected: thickness === value, disabled }}
          disabled={disabled}
          onPress={() => onChange(thickness)}
          style={{
            flex: 1,
            minHeight: 36,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: thickness === value ? "#ffffff" : "#b5bac1",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {thickness * 2} dp
          </Text>
        </RN.TouchableOpacity>
      ))}
    </RN.View>
  );
}

function HighlightColorPicker({
  title,
  value,
  choices,
  fallback,
  disabled,
  onChange,
  onFallback,
}: {
  title: string;
  value: string;
  choices: readonly HighlightChoice[];
  fallback: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onFallback: () => void;
}) {
  const color = getHighlightColor(value, choices, fallback);
  const selected = choices.find(([key]) => key === value);
  const custom = /^#[0-9a-f]{6}$/i.test(value);
  const currentName =
    selected?.[1] ?? (custom ? color.toUpperCase() : fallback.toUpperCase());
  const eyeDropper = getAssetIDByName("EyeDropperIcon");

  const swatch = (
    key: string,
    label: string,
    hex: string | undefined,
    isSelected: boolean,
    onPress: () => void,
    isCustom = false,
  ) => (
    <RN.TouchableOpacity
      key={key}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 2,
        borderColor: isSelected ? "#f2f3f5" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <RN.View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: hex ?? "transparent",
          borderWidth: hex ? 0 : 1,
          borderStyle: "dashed",
          borderColor: "#949ba4",
        }}
      >
        {isSelected ? (
          <RN.View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#ffffff",
              borderWidth: 1,
              borderColor: "#1e1f22",
            }}
          />
        ) : isCustom && eyeDropper ? (
          <RN.Image
            source={eyeDropper}
            style={{ width: 14, height: 14, tintColor: "#b5bac1" }}
          />
        ) : isCustom ? (
          <Text style={{ color: "#b5bac1", fontSize: 16 }}>+</Text>
        ) : null}
      </RN.View>
    </RN.TouchableOpacity>
  );

  return (
    <RN.View style={{ gap: 8 }}>
      <RN.View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: "#f2f3f5",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        <RN.View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
          }}
        />
        <Text
          numberOfLines={1}
          style={{ maxWidth: 110, color: "#949ba4", fontSize: 12 }}
        >
          {currentName}
        </Text>
      </RN.View>
      <RN.View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {choices.map(([key, label, hex]) =>
          swatch(key, label, hex, value === key, () => onChange(key)),
        )}
        {swatch(
          "custom",
          "Any color",
          custom ? color : undefined,
          custom,
          () => {
            if (!showHighlightColorPicker(color, choices, onChange))
              onFallback();
          },
          true,
        )}
      </RN.View>
    </RN.View>
  );
}

function HighlightGlow({
  color,
  thickness,
}: {
  color: string;
  thickness: number;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = React.useRef<any>(null);
  const firstRender = React.useRef(true);
  if (!opacity.current && RN.Animated?.Value)
    opacity.current = new RN.Animated.Value(0);

  React.useEffect(() => {
    const value = opacity.current;
    if (!value) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reduceMotion || typeof RN.Animated?.timing !== "function") {
      value.setValue(0);
      return;
    }
    value.setValue(0.5);
    const animation = RN.Animated.timing(value, {
      toValue: 0,
      duration: 700,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [color, thickness, reduceMotion]);

  if (!opacity.current || !RN.Animated?.View) return null;
  return (
    <RN.Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: `${color}55`,
        opacity: opacity.current,
      }}
    />
  );
}

function MessageHighlightSettings({
  forceUpdate,
}: {
  forceUpdate: () => void;
}) {
  const [hexDraft, setHexDraft] = React.useState("");
  const [hexTarget, setHexTarget] = React.useState<HighlightColorSetting | "">(
    "",
  );
  const enabled = storage.messageHighlightEnabled !== false;
  const disabled = !enabled || storage.enabled === false;
  const thickness = Number(storage.messageHighlightThickness) || 2;
  const pingValue = String(storage.messageHighlightPingColor ?? "default");
  const deletedValue = String(
    storage.messageHighlightDeletedColor ?? "default",
  );
  const pingColor = getHighlightColor(
    pingValue,
    HIGHLIGHT_PING_CHOICES,
    "#f0b232",
  );
  const deletedColor = getHighlightColor(
    deletedValue,
    HIGHLIGHT_DELETED_CHOICES,
    "#f23f43",
  );
  const cleanHex = hexDraft.trim();
  const validHex = /^#?[0-9a-f]{6}$/i.test(cleanHex);
  const changed =
    thickness !== 2 || pingValue !== "default" || deletedValue !== "default";

  const updateColor = (setting: HighlightColorSetting, value: string) => {
    storage[setting] = value;
    syncMessageHighlightOptions();
    forceUpdate();
  };
  const openHexFallback = (setting: HighlightColorSetting) => {
    const value = String(storage[setting] ?? "default");
    setHexTarget(setting);
    setHexDraft(/^#[0-9a-f]{6}$/i.test(value) ? value : "");
  };
  const applyHex = () => {
    if (!hexTarget || !validHex || disabled) return;
    updateColor(
      hexTarget,
      (cleanHex.startsWith("#") ? cleanHex : `#${cleanHex}`).toLowerCase(),
    );
    setHexTarget("");
    setHexDraft("");
  };

  return (
    <TableRowGroup title="Message Highlights">
      <TableSwitchRow
        label="Enable message highlights"
        subLabel="Highlight replies and mentions, plus deleted messages retained in chat."
        disabled={storage.enabled === false}
        value={enabled}
        onValueChange={(value: boolean) => {
          storage.messageHighlightEnabled = value;
          syncMessageHighlightOptions();
          forceUpdate();
        }}
      />
      <RN.View style={{ paddingHorizontal: 8, paddingBottom: 12 }}>
        <DeletedMessagesPreview
          showHistory={false}
          showDeletedMessages
          highlightEnabled={!disabled}
          pingColor={pingColor}
          deletedColor={deletedColor}
          thickness={thickness}
        />
      </RN.View>
      <RN.View
        style={{
          gap: 14,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: "#ffffff14",
        }}
      >
        <RN.View style={{ gap: 8 }}>
          <Text style={{ color: "#f2f3f5", fontSize: 14, fontWeight: "600" }}>
            Left bar width
          </Text>
          <HighlightThicknessChoice
            value={thickness}
            disabled={disabled}
            onChange={(value) => {
              storage.messageHighlightThickness = value;
              syncMessageHighlightOptions();
              forceUpdate();
            }}
          />
        </RN.View>
        <HighlightColorPicker
          title="Replies and mentions"
          value={pingValue}
          choices={HIGHLIGHT_PING_CHOICES}
          fallback="#f0b232"
          disabled={disabled}
          onChange={(value) => updateColor("messageHighlightPingColor", value)}
          onFallback={() => openHexFallback("messageHighlightPingColor")}
        />
        <HighlightColorPicker
          title="Deleted messages"
          value={deletedValue}
          choices={HIGHLIGHT_DELETED_CHOICES}
          fallback="#f23f43"
          disabled={disabled}
          onChange={(value) =>
            updateColor("messageHighlightDeletedColor", value)
          }
          onFallback={() => openHexFallback("messageHighlightDeletedColor")}
        />
        {hexTarget ? (
          <RN.View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <StableTextInput
              placeholder="#5865f2"
              value={hexDraft}
              onChangeText={setHexDraft}
              onSubmitEditing={applyHex}
              returnKeyType="done"
              maxLength={7}
              style={{ ...inputStyle, flex: 1 }}
            />
            <RN.TouchableOpacity
              accessibilityRole="button"
              disabled={!validHex || disabled}
              onPress={applyHex}
              style={{
                minHeight: 40,
                justifyContent: "center",
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: validHex && !disabled ? "#5865f2" : "#4e5058",
              }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "600" }}>Use</Text>
            </RN.TouchableOpacity>
          </RN.View>
        ) : null}
      </RN.View>
      <TableRow
        label="Reset to defaults"
        subLabel="Use a 4 dp bar, yellow for replies and mentions, and red for deleted messages."
        trailing={
          <Text
            style={{
              color: changed && !disabled ? "#f2f3f5" : "#72767d",
              fontSize: 13,
            }}
          >
            Reset
          </Text>
        }
        onPress={() => {
          if (!changed || disabled) return;
          storage.messageHighlightThickness = 2;
          storage.messageHighlightPingColor = "default";
          storage.messageHighlightDeletedColor = "default";
          setHexTarget("");
          setHexDraft("");
          syncMessageHighlightOptions();
          forceUpdate();
        }}
      />
    </TableRowGroup>
  );
}

function DeletedMessagesPreview({
  showHistory,
  showDeletedMessages,
  highlightEnabled,
  pingColor,
  deletedColor,
  thickness,
}: {
  showHistory: boolean;
  showDeletedMessages: boolean;
  highlightEnabled: boolean;
  pingColor: string;
  deletedColor: string;
  thickness: number;
}) {
  const reduceMotion = useReducedMotion();
  const versions = ["See you at 6", "See you at 7"];
  return (
    <RN.View
      style={{
        marginHorizontal: 8,
        overflow: "hidden",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#ffffff14",
        backgroundColor: "#1a1a1e",
      }}
    >
      <PreviewHeader />
      <RN.View style={{ paddingVertical: 4 }}>
        <PreviewMessage name="Alex" color="#3ba55c" time="Today at 4:01 PM">
          <RN.View>
            {showHistory &&
              versions.map((version, index) => (
                <PreviewPopIn
                  key={`${version}-${index}`}
                  reduceMotion={reduceMotion}
                >
                  <Text
                    style={{
                      color: "#949ba4",
                      fontSize: 14,
                      textDecorationLine: "line-through",
                    }}
                  >
                    {version}
                  </Text>
                </PreviewPopIn>
              ))}
            <Text style={{ color: "#dbdee1", fontSize: 15, lineHeight: 20 }}>
              See you at 8
              <Text style={{ color: "#949ba4", fontSize: 12 }}> (edited)</Text>
            </Text>
          </RN.View>
        </PreviewMessage>
        <RN.View
          style={{
            position: "relative",
            backgroundColor: highlightEnabled
              ? `${pingColor}1a`
              : "transparent",
          }}
        >
          {highlightEnabled ? (
            <HighlightGlow color={pingColor} thickness={thickness} />
          ) : null}
          {highlightEnabled ? (
            <RN.View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: thickness * 2,
                backgroundColor: pingColor,
              }}
            />
          ) : null}
          <PreviewMessage name="Sam" color="#eb459e" time="Today at 4:03 PM">
            <Text style={{ color: "#dbdee1", fontSize: 15, lineHeight: 20 }}>
              <Text
                style={{
                  color: highlightEnabled ? pingColor : "#dbdee1",
                  fontWeight: "600",
                }}
              >
                @you{" "}
              </Text>
              Yes, it looks great!
            </Text>
          </PreviewMessage>
        </RN.View>
        <RN.View
          style={{
            position: "relative",
            backgroundColor:
              showDeletedMessages && highlightEnabled
                ? `${deletedColor}1a`
                : "transparent",
          }}
        >
          {showDeletedMessages && highlightEnabled ? (
            <HighlightGlow color={deletedColor} thickness={thickness} />
          ) : null}
          {showDeletedMessages && highlightEnabled ? (
            <RN.View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: thickness * 2,
                backgroundColor: deletedColor,
              }}
            />
          ) : null}
          <PreviewMessage name="Alex" color="#3ba55c" time="Today at 4:05 PM">
            <Text style={{ color: "#dbdee1", fontSize: 15, lineHeight: 20 }}>
              {showDeletedMessages
                ? "Oops, wrong chat. Deleting this."
                : "I’ll send the link right after this."}
            </Text>
          </PreviewMessage>
        </RN.View>
      </RN.View>
      <PreviewInput />
    </RN.View>
  );
}

export function DeletedMessagesSettings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
  const keepAfterRestart = Boolean(storage.messageLoggerKeepAfterRestart);
  const limit = Number(storage.messageLoggerLimit) || 500;
  const deletedCount = Number(storage.messageLoggerDeletedCount) || 0;
  const editCount = Number(storage.messageLoggerEditCount) || 0;
  const hasStoredHistory =
    deletedCount > 0 || editCount > 0 || hasMessageHistory();
  const summary = hasStoredHistory
    ? `${deletedCount} deleted message${deletedCount === 1 ? "" : "s"} and ${editCount} edit${editCount === 1 ? "" : "s"} kept${keepAfterRestart ? ", saved on this phone." : " until Discord restarts."}`
    : "";

  const confirmClear = () => {
    RN.Alert.alert(
      "Clear saved history?",
      "Every kept deleted message and edit history will be removed from chat and this phone. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            clearMessageHistory(true);
            clearDeletedMessageHistory();
            showToast(
              "Cleared kept messages and edit history.",
              getAssetIDByName("Check"),
            );
            forceUpdate();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        {hasStoredHistory && (
          <RN.View
            style={{ padding: 12, borderRadius: 8, backgroundColor: "#2b2d31" }}
          >
            <Text style={{ color: "#f2f3f5", fontWeight: "600" }}>
              {summary}
            </Text>
          </RN.View>
        )}

        <TableRowGroup title="Preview">
          <DeletedMessagesPreview
            showHistory={storage.keepEditHistory !== false}
            showDeletedMessages={Boolean(storage.keepDeletedMessages)}
            highlightEnabled={
              storage.enabled !== false &&
              storage.messageHighlightEnabled !== false
            }
            pingColor={getHighlightColor(
              storage.messageHighlightPingColor,
              HIGHLIGHT_PING_CHOICES,
              "#f0b232",
            )}
            deletedColor={getHighlightColor(
              storage.messageHighlightDeletedColor,
              HIGHLIGHT_DELETED_CHOICES,
              "#f23f43",
            )}
            thickness={Number(storage.messageHighlightThickness) || 2}
          />
        </TableRowGroup>

        <TableRowGroup title="Edited messages">
          <TableSwitchRow
            label="Show edit history"
            subLabel="What a message said before it was edited, faded and crossed out above it. Up to 10 versions each."
            value={storage.keepEditHistory !== false}
            onValueChange={(value: boolean) => {
              setEditHistoryEnabled(value);
              updateMessageHistorySettings({ keepEditHistory: value });
              setMessageHistoryFeatureEnabled(
                storage.enabled !== false &&
                  (storage.keepDeletedMessages !== false || value),
              );
              syncMessageHighlightOptions();
              forceUpdate();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Storage">
          <TableSwitchRow
            label="Keep after restarting"
            subLabel="Deleted and edited messages survive closing Discord. Saved only on this phone, for this account."
            value={keepAfterRestart}
            onValueChange={(value: boolean) => {
              setMessageLoggerKeepAfterRestart(value);
              setMessageHistoryPersistenceEnabled(value);
              forceUpdate();
            }}
          />
        </TableRowGroup>

        <TableRowGroup title="Keep up to">
          <RN.View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <MessageLimitChoice
              value={limit}
              disabled={!storage.keepDeletedMessages}
              onChange={(value: number) => {
                setMessageLoggerLimit(value);
                setMessageHistoryLimit(value);
                forceUpdate();
              }}
            />
          </RN.View>
        </TableRowGroup>

        {hasStoredHistory && (
          <TableRowGroup title="Manage">
            <TableRow
              label="Clear kept messages"
              subLabel="Remove every deleted message and edit history kept from chat and this phone."
              trailing={<TableRow.Arrow />}
              onPress={confirmClear}
            />
          </TableRowGroup>
        )}
        <MessageHighlightSettings forceUpdate={forceUpdate} />
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
              syncMessageHighlightOptions();
              if (!value) clearMessageLoggerCache();
              setMessageHistoryFeatureEnabled(
                value &&
                  (storage.keepDeletedMessages !== false ||
                    storage.keepEditHistory !== false),
              );
              setServerInfoFeatureEnabled(
                value && storage.enableServerInfo !== false,
              );
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Keep deleted messages"
            subLabel="Deleted messages stay in chat, outlined in red."
            value={storage.keepDeletedMessages !== false}
            onValueChange={(value: boolean) => {
              storage.keepDeletedMessages = value;
              updateMessageHistorySettings({ keepDeletedMessages: value });
              syncMessageHighlightOptions();
              setMessageHistoryFeatureEnabled(
                storage.enabled !== false &&
                  (value || storage.keepEditHistory !== false),
              );
              forceUpdate();
            }}
          />
          <TableSwitchRow
            label="Enable server info"
            subLabel="Add a Server Info action to server icons in the server list."
            value={storage.enableServerInfo !== false}
            onValueChange={(value: boolean) => {
              storage.enableServerInfo = value;
              setServerInfoFeatureEnabled(value && storage.enabled !== false);
              forceUpdate();
            }}
          />
          <TableRow
            label="Word Tracker"
            subLabel="Manage keywords, matching rules, tracking targets, and alert delivery."
            trailing={<TableRow.Arrow />}
            onPress={() =>
              openSettingsPage(navigation, "Word Tracker", WordTrackerSettings)
            }
          />
          <TableRow
            label="Deleted Messages"
            subLabel="Edit history, storage and retention options."
            trailing={<TableRow.Arrow />}
            onPress={() =>
              openSettingsPage(
                navigation,
                "Deleted Messages",
                DeletedMessagesSettings,
              )
            }
          />
        </TableRowGroup>
        <PluginSettingsSection id="omniscience" />
      </Stack>
    </ScrollView>
  );
}
