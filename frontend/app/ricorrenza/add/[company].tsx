import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, MagnifyingGlass, X } from "phosphor-react-native";

import { apiGet, apiPost, Client, RecurrenceDef } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function AddRecurrenceMember() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { company } = useLocalSearchParams<{ company: string }>();

  const defsQuery = useQuery({ queryKey: ["recurrences"], queryFn: () => apiGet<RecurrenceDef[]>("/recurrences") });
  const rdef = defsQuery.data?.find((d) => d.company === company) ?? null;

  const [group, setGroup] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [agent, setAgent] = useState<string>(user?.username === "andrea" ? "andrea" : "umberto");

  // existing
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const searchQuery = useQuery({
    queryKey: ["client-search", search],
    queryFn: () => apiGet<Client[]>(`/clients/all?search=${encodeURIComponent(search)}`),
    enabled: mode === "existing" && search.trim().length >= 2,
  });

  // new
  const [ragione, setRagione] = useState("");
  const [citta, setCitta] = useState("");
  const [provincia, setProvincia] = useState("");
  const [telefono, setTelefono] = useState("");

  const activeGroup = group ?? rdef?.groups[0] ?? "";

  const add = useMutation({
    mutationFn: () => {
      const body: any = { group: activeGroup };
      if (isAdmin) body.agent = agent;
      if (mode === "existing") {
        body.client_id = selected!.id;
      } else {
        body.ragione_sociale = ragione.trim();
        body.citta = citta.trim();
        body.provincia = provincia.trim();
        body.telefono = telefono.trim();
      }
      return apiPost(`/recurrences/${company}/members`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurrence-members", company] });
      toast("Cliente aggiunto alla ricorrenza", "success");
      router.back();
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  if (defsQuery.isLoading || !rdef) return <Loading />;

  const canSubmit = mode === "existing" ? !!selected : ragione.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="add-close" onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <X size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle} numberOfLines={1}>Aggiungi a {rdef.label}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      >
        <View style={{ gap: spacing.sm }}>
          <AppText weight="medium" style={styles.label}>Gruppo della lista</AppText>
          <View style={styles.chipWrap}>
            {rdef.groups.map((g) => {
              const on = g === activeGroup;
              return (
                <Pressable key={g} onPress={() => setGroup(g)} style={[styles.chip, on && styles.chipOn]}>
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{g}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isAdmin ? (
          <View style={{ gap: spacing.sm }}>
            <AppText weight="medium" style={styles.label}>Agente</AppText>
            <View style={styles.chipWrap}>
              {[["umberto", "Umberto"], ["andrea", "Andrea"]].map(([val, lab]) => {
                const on = agent === val;
                return (
                  <Pressable key={val} onPress={() => setAgent(val)} style={[styles.chip, on && styles.chipOn]}>
                    <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{lab}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.segment}>
          <Pressable onPress={() => setMode("existing")} style={[styles.segBtn, mode === "existing" && styles.segBtnOn]}>
            <AppText weight="semibold" style={[styles.segText, mode === "existing" && styles.segTextOn]}>Cliente esistente</AppText>
          </Pressable>
          <Pressable onPress={() => setMode("new")} style={[styles.segBtn, mode === "new" && styles.segBtnOn]}>
            <AppText weight="semibold" style={[styles.segText, mode === "new" && styles.segTextOn]}>Nuovo cliente</AppText>
          </Pressable>
        </View>

        {mode === "existing" ? (
          <View style={{ gap: spacing.sm }}>
            {selected ? (
              <View style={styles.selectedBox}>
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" style={styles.cName}>{selected.ragione_sociale}</AppText>
                  <AppText style={styles.cMeta}>{selected.citta}</AppText>
                </View>
                <Pressable onPress={() => setSelected(null)} hitSlop={8}>
                  <X size={18} color={colors.muted} weight="bold" />
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.searchField}>
                  <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
                  <TextInput
                    testID="add-search"
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Cerca cliente per ragione sociale…"
                    placeholderTextColor={colors.muted}
                    style={styles.searchInput}
                    autoCapitalize="none"
                  />
                </View>
                {searchQuery.isFetching ? (
                  <AppText style={styles.hint}>Ricerca…</AppText>
                ) : (searchQuery.data ?? []).slice(0, 15).map((c) => (
                  <Pressable key={c.id} testID={`pick-${c.id}`} onPress={() => setSelected(c)} style={styles.resultRow}>
                    <View style={{ flex: 1 }}>
                      <AppText weight="medium" style={styles.cName} numberOfLines={1}>{c.ragione_sociale}</AppText>
                      <AppText style={styles.cMeta} numberOfLines={1}>{c.citta}</AppText>
                    </View>
                  </Pressable>
                ))}
                {search.trim().length >= 2 && !searchQuery.isFetching && (searchQuery.data ?? []).length === 0 ? (
                  <AppText style={styles.hint}>Nessun cliente trovato. Usa &quot;Nuovo cliente&quot;.</AppText>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <TextInput testID="new-ragione" value={ragione} onChangeText={setRagione} placeholder="Ragione sociale *" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput testID="new-citta" value={citta} onChangeText={setCitta} placeholder="Città" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput testID="new-provincia" value={provincia} onChangeText={setProvincia} placeholder="Provincia (es. CZ)" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="characters" />
            <TextInput testID="new-telefono" value={telefono} onChangeText={setTelefono} placeholder="Telefono" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.input} />
            <AppText style={styles.hint}>Il nuovo cliente resta solo nelle Ricorrenze: non viene inserito nei giri territoriali.</AppText>
          </View>
        )}

        <Button
          title="Aggiungi alla ricorrenza"
          testID="add-submit"
          icon={<Check size={18} color={colors.onBrand} weight="bold" />}
          disabled={!canSubmit}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
      </KeyboardAwareScrollView>
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
  label: { fontSize: 13, color: c.onSurfaceTertiary },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 13, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.sm },
  segBtnOn: { backgroundColor: c.surface },
  segText: { fontSize: 14, color: c.muted },
  segTextOn: { color: c.onSurface },
  searchField: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
  },
  searchInput: { flex: 1, fontFamily: "PlusJakarta-Medium", fontSize: 16, color: c.onSurface },
  input: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
    fontFamily: "PlusJakarta-Medium", fontSize: 16, color: c.onSurface,
  },
  resultRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md,
  },
  selectedBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.brandSecondary, borderRadius: radius.md, padding: spacing.md,
  },
  cName: { fontSize: 15, color: c.onSurface },
  cMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
  hint: { fontSize: 12, color: c.muted },
}));
