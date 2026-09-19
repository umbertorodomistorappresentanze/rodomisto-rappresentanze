import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretRight, Gift } from "phosphor-react-native";

import { apiGet, RecurrenceDef } from "@/src/api";
import { AppText, Loading } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function RicorrenzeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useQuery({ queryKey: ["recurrences"], queryFn: () => apiGet<RecurrenceDef[]>("/recurrences") });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <AppText weight="bold" style={styles.title}>Ricorrenze</AppText>
        <AppText style={styles.sub}>Liste commerciali dedicate, separate dai giri visita.</AppText>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(d) => d.company}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <Pressable
              testID={`recurrence-${item.company}`}
              onPress={() => router.push(`/ricorrenza/${item.company}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.icon}>
                <Gift size={24} color={colors.brand} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={1}>{item.label}</AppText>
                <AppText style={styles.meta}>
                  {item.periods.map((p) => p.label).join(" · ")}
                </AppText>
              </View>
              <CaretRight size={22} color={colors.muted} weight="bold" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.xs,
  },
  title: { fontSize: 24, color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 72,
  },
  icon: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, color: c.onSurface },
  meta: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
