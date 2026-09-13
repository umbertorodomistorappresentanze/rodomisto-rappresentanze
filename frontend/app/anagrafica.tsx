import { useMemo, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { CaretLeft, CaretRight, MagnifyingGlass, MapPin, Plus, X } from "phosphor-react-native";
import { useCallback } from "react";

import { apiGet, Client } from "@/src/api";
import { AppText, EmptyState, Loading } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Anagrafica() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: ["clients", "all"], queryFn: () => apiGet<Client[]>("/clients/all") });
  useFocusEffect(useCallback(() => { query.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => {
    const list = query.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) => c.ragione_sociale.toLowerCase().includes(s));
  }, [query.data, search]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable testID="anagrafica-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <CaretLeft size={22} color={colors.onSurface} weight="bold" />
          </Pressable>
          <AppText weight="bold" style={styles.title}>Anagrafica Clienti</AppText>
        </View>
        <View style={styles.searchBox}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            testID="anagrafica-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca per ragione sociale…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable testID="anagrafica-search-clear" onPress={() => setSearch("")} hitSlop={8}>
              <X size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ) : null}
        </View>
        <AppText style={styles.count}>{data.length} clienti</AppText>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + 96 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`anagrafica-row-${item.id}`}
              onPress={() => router.push(`/client/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={1}>{item.ragione_sociale}</AppText>
                <View style={styles.metaRow}>
                  <MapPin size={13} color={colors.muted} weight="bold" />
                  <AppText style={styles.meta} numberOfLines={1}>{item.citta || "—"}</AppText>
                </View>
                <View style={styles.agentBadge}>
                  <AppText weight="medium" style={styles.agentText}>
                    {item.agent === "umberto" ? "Umberto" : "Andrea"}
                  </AppText>
                </View>
              </View>
              <CaretRight size={20} color={colors.muted} weight="bold" />
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState title="Nessun cliente trovato" text="Prova con un altro nome." />}
        />
      )}

      <Pressable
        testID="anagrafica-add"
        onPress={() => router.push("/client/new")}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Plus size={26} color={colors.onBrand} weight="bold" />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, color: c.onSurface },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface },
  count: { fontSize: 12, color: c.muted },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 64,
  },
  name: { fontSize: 16, color: c.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  meta: { fontSize: 13, color: c.muted },
  agentBadge: { alignSelf: "flex-start", backgroundColor: c.brandSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 },
  agentText: { fontSize: 11, color: c.onBrandSecondary },
  fab: {
    position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: radius.pill,
    backgroundColor: c.brand, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
}));
