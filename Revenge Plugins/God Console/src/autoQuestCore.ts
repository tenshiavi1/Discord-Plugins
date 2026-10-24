export type AutoQuestTask = {
	kind: "video" | "activity";
	type: string;
	target: number;
	applicationId?: string;
};

export type AutoQuestOptions = {
	video: boolean;
	activity: boolean;
};

const VIDEO_TASKS = ["WATCH_VIDEO_ON_MOBILE", "WATCH_VIDEO"];
const ACTIVITY_TASK = "PLAY_ACTIVITY";
const MOBILE_ACTIVITY_FEATURE = 36;

function questTasks(item: any) {
	const config = item?.config;
	return (config?.taskConfigV2 ?? config?.taskConfig)?.tasks;
}

function applicationId(item: any, task: any) {
	const id = task?.applications?.find((application: any) => application?.id != null)?.id
		?? item?.config?.application?.id;
	const normalized = id == null ? "" : String(id);
	return /^\d{5,25}$/.test(normalized) ? normalized : undefined;
}

export function getAutoQuestTask(item: any, options: AutoQuestOptions): AutoQuestTask | undefined {
	const tasks = questTasks(item);
	if (!tasks || typeof tasks !== "object") return undefined;

	if (options.video) {
		for (const type of VIDEO_TASKS) {
			const target = Number(tasks[type]?.target);
			if (Number.isFinite(target) && target > 0) return { kind: "video", type, target };
		}
	}

	const activity = tasks[ACTIVITY_TASK];
	const features = item?.config?.features;
	if (
		options.activity &&
		Array.isArray(features) &&
		features.includes(MOBILE_ACTIVITY_FEATURE) &&
		Number(activity?.target) > 0
	) {
		const id = applicationId(item, activity);
		if (id) return { kind: "activity", type: ACTIVITY_TASK, target: Number(activity.target), applicationId: id };
	}
	return undefined;
}

export function getQuestExpiry(item: any) {
	const value = item?.config?.expiresAt;
	const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value ?? ""));
	return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function getQuestProgress(item: any, type: string) {
	const value = Number(item?.userStatus?.progress?.[type]?.value);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export function canProcessQuest(item: any, now: number) {
	return typeof item?.id === "string" &&
		!!item.config &&
		!item.userStatus?.completedAt &&
		getQuestExpiry(item) > now + 60_000;
}
