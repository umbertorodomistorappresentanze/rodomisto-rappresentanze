import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, MapTrifold, X } from "phosphor-react-native";

import { apiGet, apiPut, Client, Giro } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function VerifyAssign() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const clientQuery = useQuery({ queryKey: ["client", id], queryFn: () => apiGet<Client>(`/clients/${id}`) });
  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const [giroId, setGiroId] = useState<string | null>(null);

  const assign = useMutation({
    mutationFn: () => apiPut(`/clients/${id}`, { giro_id: giroId, position: 100000 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["da-verificare"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast("Cliente assegnato al giro", "success");
      router.back();
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  if (clientQuery.isLoading || giriQuery.isLoading || !clientQuery.data) return <Loading />;
  const c = clientQuery.data;
  const giri = (giriQuery.data ?? []).slice().sort((a, b) => a.order - b.order);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="assign-close" onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle} numberOfLines={1}>Conferma / Assegna</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={styles.infoCard}>
          <AppText weight="bold" style={styles.name}>{c.ragione_sociale}</AppText>
          <Info label="Comune" value={c.citta} />
          <Info label="Indirizzo" value={c.indirizzo} />
          <Info label="Descrizione zona" value={c.zona} />
          <Info label="Agente" value={c.agent === "andrea" ? "Andrea" : "Umberto"} />
          {c.provincia ? <Info label="Provincia" value={c.provincia} /> : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText weight="medium" style={styles.label}>Scegli il giro territoriale</AppText>
          {giri.map((g) => {
            const on = g.id === giroId;
            return (
              <Pressable
                key={g.id}
                testID={`assign-giro-${g.id}`}
                onPress={() => setGiroId(g.id)}
                style={({ pressed }) => [styles.giroRow, on && styles.giroRowOn, pressed && { opacity: 0.85 }]}
              >
                <MapTrifold size={20} color={on ? colors.onBrand : colors.brand} weight="bold" />
                <AppText weight="semibold" style={[styles.giroText, on && { color: colors.onBrand }]}>{g.name}</AppText>
                {on ? <Check size={18} color={colors.onBrand} weight="bold" /> : null}
              </Pressable>
            );
          })}
          <AppText style={styles.hint}>Il cliente viene aggiunto in fondo al giro, senza modificare l&apos;ordine degli altri.</AppText>
        </View>

        <Button
          title="Conferma e assegna al giro"
          testID="assign-confirm"
          icon={<Check size={18} color={colors.onBrand} weight="bold" />}
          disabled={!giroId}
          loading={assign.isPending}
          onPress={() => assign.mutate()}
        />
        <Button title="Lascia da verificare" testID="assign-later" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <AppText style={styles.infoLabel}>{label}</AppText>
      <AppText weight="medium" style={styles.infoValue}>{value}</AppText>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  iconBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, color: c.onSurface, flex: 1 },
  infoCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  name: { fontSize: 18, color: c.onSurface, marginBottom: spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  infoLabel: { fontSize: 13, color: c.muted },
  infoValue: { fontSize: 13, color: c.onSurface, flexShrink: 1, textAlign: "right" },
  label: { fontSize: 13, color: c.onSurfaceTertiary },
  giroRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.md, minHeight: 52,
  },
  giroRowOn: { backgroundColor: c.brand, borderColor: c.brand },
  giroText: { flex: 1, fontSize: 15, color: c.onSurface },
  hint: { fontSize: 12, color: c.muted },
}));
