import { ActivityIndicator, Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  btn: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  btnPrimary: { backgroundColor: c.brand },
  btnSecondary: { backgroundColor: c.brandSecondary },
  btnGhost: { backgroundColor: c.surfaceTertiary },
  btnDisabled: { opacity: 0.5 },
  btnTextPrimary: { color: c.onBrand, fontFamily: fonts.semibold, fontSize: 16 },
  btnTextSecondary: { color: c.onBrandSecondary, fontFamily: fonts.semibold, fontSize: 16 },
  btnTextGhost: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 16 },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyImg: { width: 160, height: 120, borderRadius: radius.lg },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 16, color: c.onSurface, textAlign: "center" },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, color: c.muted, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
}));

export function AppText(props: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  weight?: keyof typeof fonts;
  numberOfLines?: number;
}) {
  const { colors } = useTheme();
  const family = fonts[props.weight ?? "regular"];
  return (
    <Text
      numberOfLines={props.numberOfLines}
      style={[{ fontFamily: family, color: colors.onSurface }, props.style]}
    >
      {props.children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg = variant === "primary" ? styles.btnPrimary : variant === "secondary" ? styles.btnSecondary : styles.btnGhost;
  const txt = variant === "primary" ? styles.btnTextPrimary : variant === "secondary" ? styles.btnTextSecondary : styles.btnTextGhost;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.btn, bg, (disabled || loading) && styles.btnDisabled, pressed && { opacity: 0.85 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.onBrand : colors.onBrandSecondary} />
      ) : (
        <>
          {icon}
          <Text style={txt}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function EmptyState({ title, text, image }: { title: string; text?: string; image?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      {image ? <Image source={{ uri: image }} style={styles.emptyImg} contentFit="cover" /> : null}
      <AppText style={styles.emptyTitle} weight="semibold">{title}</AppText>
      {text ? <AppText style={styles.emptyText}>{text}</AppText> : null}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  );
}
