import { useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { DotsSixVertical, MapTrifold, Plus, X } from "phosphor-react-native";

import { apiGet, apiPost, Giro } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function GiriScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (n: string) => apiPost<Giro>("/giri", { name: n, localities: [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["giri"] });
      setAdding(false);
      setName("");
      toast("Giro creato", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <AppText weight="bold" style={styles.title}>Giri</AppText>
          <Pressable testID="add-giro-btn" onPress={() => setAdding((a) => !a)} style={styles.plusBtn}>
            {adding ? <X size={20} color={colors.onBrand} weight="bold" /> : <Plus size={20} color={colors.onBrand} weight="bold" />}
          </Pressable>
        </View>
        <AppText style={styles.sub}>Configura i giri e l&apos;ordine delle località.</AppText>
        {adding ? (
          <View style={styles.addBox}>
            <TextInput
              testID="new-giro-name"
              value={name}
              onChangeText={setName}
              placeholder="Nome del nuovo giro"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Button
              title="Crea giro"
              testID="create-giro-submit"
              disabled={!name.trim()}
              loading={create.isPending}
              onPress={() => create.mutate(name.trim())}
            />
          </View>
        ) : null}
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <Pressable
              testID={`giro-manage-${item.id}`}
              onPress={() => router.push(`/giro/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.icon}>
                <MapTrifold size={22} color={colors.brand} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={1}>{item.name}</AppText>
                <AppText style={styles.meta}>{item.client_count ?? 0} clienti · tocca per modificare l&apos;ordine</AppText>
              </View>
              <DotsSixVertical size={22} color={colors.muted} weight="bold" />
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
  headerRow: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 24, color: c.onSurface, flex: 1 },
  plusBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  sub: { fontSize: 13, color: c.muted },
  addBox: { gap: spacing.sm, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
    fontFamily: "PlusJakarta-Medium", fontSize: 16, color: c.onSurface,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 68,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, color: c.onSurface },
  meta: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
