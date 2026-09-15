import { useEffect, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowDown, ArrowUp, CaretLeft, Check, DotsSixVertical, Plus, Trash } from "phosphor-react-native";

import { apiGet, apiPut, Giro } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function GiroReorder() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const giro = query.data?.find((g) => g.id === id) ?? null;

  const [name, setName] = useState("");
  const [localities, setLocalities] = useState<string[]>([]);
  const [newLoc, setNewLoc] = useState("");
  const [newPos, setNewPos] = useState("");

  useEffect(() => {
    if (giro) {
      setName(giro.name);
      setLocalities(giro.localities);
    }
  }, [giro?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => apiPut<Giro>(`/giri/${id}`, { name: name.trim(), localities }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["giri"] });
      toast("Giro salvato", "success");
      router.back();
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  if (query.isLoading || !giro) return <Loading />;

  function addLocality() {
    const v = newLoc.trim();
    if (!v) return;
    setLocalities((l) => {
      const n = l.length;
      let idx = n; // default: in fondo
      if (newPos.trim()) {
        const p = parseInt(newPos, 10);
        if (!isNaN(p)) idx = Math.max(0, Math.min(n, p - 1));
      }
      const copy = [...l];
      copy.splice(idx, 0, v);
      return copy;
    });
    setNewLoc("");
    setNewPos("");
  }

  function move(index: number, dir: -1 | 1) {
    setLocalities((l) => {
      const j = index + dir;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  }

  function removeLocality(index: number) {
    setLocalities((l) => l.filter((_, i) => i !== index));
  }

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<string>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <View style={[styles.locRow, isActive && styles.locRowActive]}>
          <Pressable
            testID={`drag-${index}`}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              drag();
            }}
            delayLongPress={120}
            style={styles.dragHandle}
          >
            <DotsSixVertical size={22} color={colors.muted} weight="bold" />
          </Pressable>
          <View style={styles.posBadge}>
            <AppText weight="bold" style={styles.posText}>{index + 1}</AppText>
          </View>
          <AppText weight="medium" style={styles.locName} numberOfLines={1}>{item}</AppText>
          <Pressable testID={`move-up-${index}`} onPress={() => move(index, -1)} disabled={index === 0} hitSlop={6} style={[styles.arrowBtn, index === 0 && styles.arrowDisabled]}>
            <ArrowUp size={16} color={colors.onSurfaceSecondary} weight="bold" />
          </Pressable>
          <Pressable testID={`move-down-${index}`} onPress={() => move(index, 1)} disabled={index === localities.length - 1} hitSlop={6} style={[styles.arrowBtn, index === localities.length - 1 && styles.arrowDisabled]}>
            <ArrowDown size={16} color={colors.onSurfaceSecondary} weight="bold" />
          </Pressable>
          <Pressable testID={`remove-loc-${index}`} onPress={() => removeLocality(index)} hitSlop={8} style={styles.removeBtn}>
            <Trash size={18} color={colors.error} weight="bold" />
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="giro-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle}>Modifica giro</AppText>
        <Pressable testID="giro-save" onPress={() => save.mutate()} hitSlop={8} style={styles.saveBtn}>
          <Check size={20} color={colors.onBrand} weight="bold" />
        </Pressable>
      </View>

      {/* Fixed section: name + always-visible "Aggiungi località" */}
      <View style={styles.fixedTop}>
        <View>
          <AppText weight="medium" style={styles.label}>Nome giro</AppText>
          <TextInput
            testID="giro-name-input"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={styles.addRow}>
          <TextInput
            testID="add-loc-input"
            value={newLoc}
            onChangeText={setNewLoc}
            placeholder="Aggiungi località…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { flex: 1 }]}
            onSubmitEditing={addLocality}
            returnKeyType="done"
          />
          <TextInput
            testID="add-loc-pos"
            value={newPos}
            onChangeText={setNewPos}
            placeholder="Pos."
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={[styles.input, styles.posInput]}
          />
          <Pressable testID="add-loc-btn" onPress={addLocality} style={styles.addBtn}>
            <Plus size={22} color={colors.onBrand} weight="bold" />
          </Pressable>
        </View>
        <AppText style={styles.hint}>
          Lascia &quot;Pos.&quot; vuoto per aggiungere in fondo, oppure indica il numero della posizione desiderata.
        </AppText>
        <AppText weight="medium" style={styles.label}>
          Ordine delle località · trascina o usa le frecce per riordinare
        </AppText>
      </View>

      <DraggableFlatList
        data={localities}
        onDragEnd={({ data }) => setLocalities(data)}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={renderItem}
        activationDistance={Platform.OS === "web" ? 1 : 12}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title="Salva ordine giro" testID="giro-save-btn" loading={save.isPending} onPress={() => save.mutate()} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  fixedTop: {
    backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, color: c.onSurface, flex: 1 },
  saveBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, color: c.onSurfaceTertiary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
    fontFamily: "PlusJakarta-Medium", fontSize: 16, color: c.onSurface,
  },
  locRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 58,
  },
  locRowActive: { borderColor: c.brand, backgroundColor: c.brandSecondary },
  dragHandle: { padding: spacing.xs },
  posBadge: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  posText: { fontSize: 12, color: c.onBrandSecondary },
  locName: { fontSize: 15, color: c.onSurface, flex: 1 },
  arrowBtn: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  arrowDisabled: { opacity: 0.35 },
  removeBtn: { padding: spacing.xs },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  posInput: { width: 64, textAlign: "center", paddingHorizontal: spacing.xs },
  hint: { fontSize: 12, color: c.muted },
  addBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  footer: { padding: spacing.lg, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
