import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps } from "../../compat";
import { showToast } from "../../shared/toast";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import StableTextInput from "../../StableTextInput";

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

export default function Settings() {
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
            label="Enable Omniscience"
            subLabel="Turn message keyword monitoring on or off."
            value={storage.enabled !== false}
            onValueChange={(v: boolean) => { storage.enabled = v; forceUpdate(); }}
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

        <TableRowGroup title="Plugin Settings">
          <TableSwitchRow
            label="Show in Settings"
            subLabel="Add a shortcut to Omniscience in Discord settings."
            value={storage.showInSettings}
            onValueChange={(v: boolean) => { storage.showInSettings = v; forceUpdate(); }}
          />
        </TableRowGroup>

      </Stack>
    </ScrollView>
  );
}
