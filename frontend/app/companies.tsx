import { useState } from "react";
import { FlatList, Pressable, Switch, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretLeft, Plus, Storefront } from "phosphor-react-native";

import { apiGet, apiPost, apiPut, Company } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function CompaniesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const query = useQuery({ queryKey: ["companies", "all"], queryFn: () => apiGet<Company[]>("/companies?include_inactive=true") });

  const create = useMutation({
    mutationFn: () => apiPost<Company>("/companies", { name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      setName("");
      toast("Azienda aggiunta", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  const toggle = useMutation({
    mutationFn: (co: Company) => apiPut<Company>(`/companies/${co.id}`, { active: !co.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="companies-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle}>Aziende</AppText>
      </View>

      <View style={styles.addRow}>
        <TextInput
          testID="company-name-input"
          value={name}
          onChangeText={setName}
          placeholder="Nuova azienda…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { flex: 1 }]}
          onSubmitEditing={() => name.trim() && create.mutate()}
        />
        <Pressable testID="add-company-btn" disabled={!name.trim()} onPress={() => create.mutate()} style={[styles.addBtn, !name.trim() && { opacity: 0.5 }]}>
          <Plus size={22} color={colors.onBrand} weight="bold" />
        </Pressable>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`company-${item.id}`}>
              <View style={styles.icon}>
                <Storefront size={20} color={item.active ? colors.brand : colors.muted} weight="fill" />
              </View>
              <AppText weight="semibold" style={[styles.name, !item.active && { color: colors.muted }]}>{item.name}</AppText>
              <Switch
                testID={`company-toggle-${item.id}`}
                value={item.active}
                onValueChange={() => toggle.mutate(item)}
                trackColor={{ true: colors.brandPrimary, false: colors.border }}
                thumbColor={colors.surface}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, color: c.onSurface },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  input: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
    fontFamily: "PlusJakarta-Medium", fontSize: 16, color: c.onSurface,
  },
  addBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
    padding: spacing.md, minHeight: 60,
  },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, color: c.onSurface, flex: 1 },
}));
