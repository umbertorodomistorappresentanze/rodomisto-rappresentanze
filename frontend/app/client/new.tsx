import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Check, MapTrifold, X } from "phosphor-react-native";

import { apiGet, apiPost, Client, Giro } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function NewClient() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });

  const [form, setForm] = useState({
    ragione_sociale: "",
    provincia: "",
    citta: "",
    zona: "",
    indirizzo: "",
    cap: "",
    telefono: "",
    email: "",
    position: "",
  });
  const [giroId, setGiroId] = useState<string | null>(null);
  const [showGiro, setShowGiro] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      apiPost<Client>("/clients", {
        ragione_sociale: form.ragione_sociale.trim(),
        provincia: form.provincia.trim(),
        citta: form.citta.trim(),
        zona: form.zona.trim(),
        indirizzo: form.indirizzo.trim(),
        cap: form.cap.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        giro_id: giroId,
        position: form.position ? parseInt(form.position, 10) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["da-verificare"] });
      toast("Cliente aggiunto", "success");
      router.back();
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  if (giriQuery.isLoading) return <Loading />;
  const selectedGiro = giriQuery.data?.find((g) => g.id === giroId);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <AppText weight="bold" style={styles.headerTitle}>Nuovo cliente</AppText>
        <Pressable testID="new-client-close" onPress={() => router.back()} hitSlop={8} style={styles.closeBtn}>
          <X size={20} color={colors.onSurfaceSecondary} weight="bold" />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={80}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <LabeledInput label="Ragione sociale *" value={form.ragione_sociale} onChange={set("ragione_sociale")} testID="f-ragione" />

        {/* Giro picker */}
        <View>
          <AppText weight="medium" style={styles.label}>Giro</AppText>
          <Pressable testID="f-giro-toggle" onPress={() => setShowGiro((s) => !s)} style={styles.pickerBtn}>
            <MapTrifold size={18} color={colors.brand} weight="bold" />
            <AppText weight="medium" style={styles.pickerText}>
              {selectedGiro ? selectedGiro.name : "Nessun giro (Da Verificare)"}
            </AppText>
          </Pressable>
          {showGiro ? (
            <View style={styles.pickerList}>
              <Pressable testID="f-giro-none" onPress={() => { setGiroId(null); setShowGiro(false); }} style={styles.pickerItem}>
                <AppText style={styles.pickerItemText}>Nessun giro (Da Verificare)</AppText>
              </Pressable>
              {(giriQuery.data ?? []).map((g) => (
                <Pressable key={g.id} testID={`f-giro-${g.id}`} onPress={() => { setGiroId(g.id); setShowGiro(false); }} style={styles.pickerItem}>
                  <AppText style={styles.pickerItemText}>{g.name}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <LabeledInput label="Posizione nel giro" value={form.position} onChange={set("position")} keyboardType="number-pad" testID="f-position" />
        <LabeledInput label="Provincia" value={form.provincia} onChange={set("provincia")} testID="f-provincia" />
        <LabeledInput label="Città" value={form.citta} onChange={set("citta")} testID="f-citta" />
        <LabeledInput label="Zona / destinazione" value={form.zona} onChange={set("zona")} testID="f-zona" />
        <LabeledInput label="Indirizzo" value={form.indirizzo} onChange={set("indirizzo")} testID="f-indirizzo" />
        <LabeledInput label="CAP" value={form.cap} onChange={set("cap")} keyboardType="number-pad" testID="f-cap" />
        <LabeledInput label="Telefono" value={form.telefono} onChange={set("telefono")} keyboardType="phone-pad" testID="f-telefono" />
        <LabeledInput label="Email" value={form.email} onChange={set("email")} keyboardType="email-address" testID="f-email" />
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title="Salva cliente"
          testID="save-client-btn"
          icon={<Check size={20} color={colors.onBrand} weight="bold" />}
          disabled={!form.ragione_sociale.trim()}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </View>
    </View>
  );
}

function LabeledInput({
  label, value, onChange, keyboardType, testID,
}: {
  label: string; value: string; onChange: (v: string) => void; keyboardType?: any; testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <AppText weight="medium" style={styles.label}>{label}</AppText>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerTitle: { fontSize: 20, color: c.onSurface, flex: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, color: c.onSurfaceTertiary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
    fontFamily: "PlusJakarta-Medium", fontSize: 16, color: c.onSurface,
  },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52,
  },
  pickerText: { fontSize: 16, color: c.onSurface },
  pickerList: { marginTop: spacing.sm, gap: spacing.xs, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.xs },
  pickerItem: { padding: spacing.md, borderRadius: radius.sm },
  pickerItemText: { fontSize: 15, color: c.onSurface, fontFamily: "PlusJakarta-Medium" },
  footer: { padding: spacing.lg, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
