import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CheckCircle, MapTrifold, X } from "phosphor-react-native";

import { apiGet, Giro } from "@/src/api";
import { AppText, Loading } from "@/src/components/ui";
import { useSelectedGiro } from "@/src/selected-giro";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function SelectGiro() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { giroId, setGiroId } = useSelectedGiro();
  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });

  function pick(id: string) {
    setGiroId(id);
    router.back();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <AppText weight="bold" style={styles.title}>Seleziona il giro</AppText>
        <Pressable testID="close-select-giro" onPress={() => router.back()} style={styles.closeBtn}>
          <X size={20} color={colors.onSurfaceSecondary} weight="bold" />
        </Pressable>
      </View>
      <AppText style={styles.sub}>Scegli manualmente il giro che vuoi fare oggi.</AppText>

      {giriQuery.isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          {(giriQuery.data ?? []).map((g) => {
            const active = g.id === giroId;
            return (
              <Pressable
                key={g.id}
                testID={`giro-option-${g.id}`}
                onPress={() => pick(g.id)}
                style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.icon, active && { backgroundColor: colors.brand }]}>
                  <MapTrifold size={24} color={active ? colors.onBrand : colors.brand} weight="fill" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" style={styles.name}>{g.name}</AppText>
                  <AppText style={styles.meta}>{g.localities.length} località</AppText>
                </View>
                {active ? <CheckCircle size={24} color={colors.brand} weight="fill" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg },
  title: { fontSize: 22, color: c.onSurface, flex: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  sub: { fontSize: 14, color: c.muted, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: c.border, minHeight: 76,
  },
  cardActive: { borderColor: c.brand, backgroundColor: c.brandSecondary },
  icon: {
    width: 46, height: 46, borderRadius: radius.md, backgroundColor: c.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 16, color: c.onSurface },
  meta: { fontSize: 13, color: c.muted, marginTop: 2 },
}));
