import { expect, test } from "bun:test";
import { canProcessQuest, getAutoQuestTask, getQuestExpiry, getQuestProgress } from "./autoQuestCore";

const now = Date.parse("2026-10-24T00:00:00Z");

test("selects supported video task formats and validates task targets", () => {
	const quest = {
		config: {
			taskConfigV2: { tasks: { WATCH_VIDEO_ON_MOBILE: { target: 30 }, WATCH_VIDEO: { target: 60 } } },
		},
	};

	expect(getAutoQuestTask(quest, { video: true, activity: false })).toEqual({
		kind: "video",
		type: "WATCH_VIDEO_ON_MOBILE",
		target: 30,
	});
	expect(getAutoQuestTask({
		config: { taskConfig: { tasks: { WATCH_VIDEO: { target: "90" } } } },
	}, { video: true, activity: false })?.target).toBe(90);
	expect(getAutoQuestTask({
		config: { taskConfig: { tasks: { WATCH_VIDEO: { target: 0 } } } },
	}, { video: true, activity: false })).toBeUndefined();
});

test("only selects mobile-compatible Activity tasks with a valid application ID", () => {
	const quest = {
		config: {
			features: [36],
			application: { id: "123456" },
			taskConfig: { tasks: { PLAY_ACTIVITY: { target: 120 } } },
		},
	};

	expect(getAutoQuestTask(quest, { video: false, activity: true })).toEqual({
		kind: "activity",
		type: "PLAY_ACTIVITY",
		target: 120,
		applicationId: "123456",
	});
	expect(getAutoQuestTask({
		config: { features: [], taskConfig: quest.config.taskConfig, application: quest.config.application },
	}, { video: false, activity: true })).toBeUndefined();
	expect(getAutoQuestTask({
		config: {
			features: [36],
			taskConfig: { tasks: { PLAY_ACTIVITY: { target: 120, applications: [{ id: "not-an-id" }] } } },
		},
	}, { video: false, activity: true })).toBeUndefined();
});

test("filters completed and soon-expiring quests and reads progress safely", () => {
	const quest = {
		id: "quest-1",
		config: { expiresAt: now + 120_000 },
		userStatus: { progress: { PLAY_ACTIVITY: { value: 15 } } },
	};

	expect(canProcessQuest(quest, now)).toBe(true);
	expect(canProcessQuest({ ...quest, config: { expiresAt: now + 30_000 } }, now)).toBe(false);
	expect(canProcessQuest({ ...quest, userStatus: { completedAt: "done" } }, now)).toBe(false);
	expect(getQuestExpiry(quest)).toBe(now + 120_000);
	expect(getQuestProgress(quest, "PLAY_ACTIVITY")).toBe(15);
	expect(getQuestProgress({}, "PLAY_ACTIVITY")).toBe(0);
});
