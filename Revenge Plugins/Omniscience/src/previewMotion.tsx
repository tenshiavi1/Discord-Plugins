import { React, ReactNative as RN } from "@vendetta/metro/common";

function useReducedMotion() {
	const [reduceMotion, setReduceMotion] = React.useState(false);
	React.useEffect(() => {
		let active = true;
		const accessibility = RN.AccessibilityInfo;
		if (typeof accessibility?.isReduceMotionEnabled === "function") {
			void Promise.resolve(accessibility.isReduceMotionEnabled())
				.then((enabled: boolean) => { if (active) setReduceMotion(enabled); })
				.catch(() => {});
		}
		const subscription = accessibility?.addEventListener?.("reduceMotionChanged", (enabled: boolean) => {
			if (active) setReduceMotion(enabled);
		});
		return () => {
			active = false;
			subscription?.remove?.();
		};
	}, []);
	return reduceMotion;
}

export function SmoothPreviewSwap({ revision, children }: { revision: string | number; children: unknown }) {
	const reduceMotion = useReducedMotion();
	const Animated = RN.Animated;
	const value = React.useRef<any>(null);
	if (!value.current && typeof Animated?.Value === "function") value.current = new Animated.Value(1);

	React.useEffect(() => {
		const progress = value.current;
		if (!progress) return undefined;
		if (reduceMotion || typeof Animated.spring !== "function") {
			progress.setValue(1);
			return undefined;
		}
		progress.setValue(0);
		const animation = Animated.spring(progress, {
			toValue: 1,
			speed: 20,
			bounciness: 7,
			useNativeDriver: true,
		});
		animation.start();
		return () => animation.stop();
	}, [revision, reduceMotion]);

	if (!value.current || !Animated?.View) return <RN.View>{children}</RN.View>;
	return (
		<Animated.View
			style={{
				opacity: value.current.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1], extrapolate: "clamp" }),
				transform: [{ scale: value.current.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1], extrapolate: "clamp" }) }],
			}}
		>
			{children}
		</Animated.View>
	);
}