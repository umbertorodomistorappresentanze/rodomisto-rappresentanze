import { Fragment, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { MapTrifold, Plus, Trash } from "phosphor-react-native";

import { Giro, Site } from "@/src/api";
import { AppText } from "@/src/components/ui";
import { normalizeProvincia } from "@/src/utils/provincia";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

function emptySite(): Site {
  return { nominativo: "", indirizzo: "", cap: "", citta: "", provincia: "", zona: "", giro_id: null, position: null };
}

export function SitesEditor({
  value,
  onChange,
  giri,
}: {
  value: Site[];
  onChange: (sites: Site[]) => void;
  giri: Giro[];
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [openGiro, setOpenGiro] = useState<number | null>(null);

  const update = (i: number, patch: Partial<Site>) => {
    const next = value.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, emptySite()]);

  return (
    <View style={{ gap: spacing.md }}>
      <AppText weight="bold" style={styles.sectionTitle}>Sedi di scarico aggiuntive</AppText>
      <AppText style={styles.sectionHint}>
        Oltre alla sede principale qui sopra, aggiungi altre sedi di consegna. Ogni sede può avere un proprio Giro e una propria Posizione nel giro.
      </AppText>

      {value.map((s, i) => {
        const selGiro = giri.find((g) => g.id === s.giro_id);
        return (
          <View key={s.id ?? i} style={styles.card} testID={`site-card-${i}`}>
            <View style={styles.cardHead}>
              <AppText weight="bold" style={styles.cardTitle}>Sede {i + 1}</AppText>
              <Pressable testID={`site-remove-${i}`} onPress={() => remove(i)} hitSlop={8} style={styles.removeBtn}>
                <Trash size={18} color={colors.error} weight="bold" />
              </Pressable>
            </View>

            <Field label="Nominativo sede di scarico" value={s.nominativo} onChange={(v) => update(i, { nominativo: v })} testID={`site-nominativo-${i}`} />
            <Field label="Indirizzo" value={s.indirizzo} onChange={(v) => update(i, { indirizzo: v })} testID={`site-indirizzo-${i}`} />
            <View style={styles.rowTwo}>
              <View style={{ flex: 1 }}>
                <Field label="CAP" value={s.cap} onChange={(v) => update(i, { cap: v })} keyboardType="number-pad" testID={`site-cap-${i}`} />
              </View>
              <View style={{ flex: 2 }}>
                <Field label="Città" value={s.citta} onChange={(v) => update(i, { citta: v })} testID={`site-citta-${i}`} />
              </View>
            </View>
            <View style={styles.rowTwo}>
              <View style={{ flex: 1 }}>
                <View>
                  <AppText weight="medium" style={styles.label}>Provincia</AppText>
                  <TextInput
                    testID={`site-provincia-${i}`}
                    value={s.provincia}
                    onChangeText={(v) => update(i, { provincia: v })}
                    onBlur={() => update(i, { provincia: normalizeProvincia(s.provincia) })}
                    onEndEditing={() => update(i, { provincia: normalizeProvincia(s.provincia) })}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="CZ"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                </View>
              </View>
              <View style={{ flex: 2 }}>
                <Field label="Zona / destinazione" value={s.zona} onChange={(v) => update(i, { zona: v })} testID={`site-zona-${i}`} />
              </View>
            </View>

            <View>
              <AppText weight="medium" style={styles.label}>Giro territoriale</AppText>
              <Pressable testID={`site-giro-toggle-${i}`} onPress={() => setOpenGiro(openGiro === i ? null : i)} style={styles.pickerBtn}>
                <MapTrifold size={18} color={colors.brand} weight="bold" />
                <AppText weight="medium" style={styles.pickerText}>{selGiro ? selGiro.name : "Nessun giro"}</AppText>
              </Pressable>
              {openGiro === i ? (
                <View style={styles.pickerList}>
                  <Pressable testID={`site-giro-none-${i}`} onPress={() => { update(i, { giro_id: null }); setOpenGiro(null); }} style={styles.pickerItem}>
                    <AppText style={styles.pickerItemText}>Nessun giro</AppText>
                  </Pressable>
                  {giri.map((g) => (
                    <Pressable key={g.id} testID={`site-giro-${i}-${g.id}`} onPress={() => { update(i, { giro_id: g.id }); setOpenGiro(null); }} style={styles.pickerItem}>
                      <AppText style={styles.pickerItemText}>{g.name}</AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View>
              <AppText weight="medium" style={styles.label}>Posizione nel giro</AppText>
              <TextInput
                testID={`site-position-${i}`}
                value={s.position != null ? String(s.position) : ""}
                onChangeText={(v) => update(i, { position: v ? parseInt(v, 10) || null : null })}
                keyboardType="number-pad"
                placeholder="es. 1, 2, 3…"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </View>
          </View>
        );
      })}

      <Pressable testID="site-add" onPress={add} style={styles.addBtn}>
        <Plus size={18} color={colors.brand} weight="bold" />
        <AppText weight="semibold" style={styles.addText}>Aggiungi sede di scarico</AppText>
      </Pressable>
    </View>
  );
}

function Field({
  label, value, onChange, keyboardType, testID,
}: { label: string; value: string; onChange: (v: string) => void; keyboardType?: any; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Fragment>
      <AppText weight="medium" style={styles.label}>{label}</AppText>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
    </Fragment>
  );
}

const useStyles = makeStyles((c) => ({
  sectionTitle: { fontSize: 15, color: c.onSurface },
  sectionHint: { fontSize: 12, color: c.muted, lineHeight: 18 },
  card: {
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  cardTitle: { fontSize: 14, color: c.brand },
  removeBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTwo: { flexDirection: "row", gap: spacing.sm },
  label: { fontSize: 13, color: c.onSurfaceTertiary, marginBottom: spacing.xs, marginTop: spacing.xs },
  input: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48,
    fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface,
  },
  pickerBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48,
  },
  pickerText: { fontSize: 15, color: c.onSurface },
  pickerList: { marginTop: spacing.xs, gap: spacing.xs, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.xs, backgroundColor: c.surface },
  pickerItem: { padding: spacing.md, borderRadius: radius.sm },
  pickerItemText: { fontSize: 15, color: c.onSurface, fontFamily: "PlusJakarta-Medium" },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.brand, borderRadius: radius.md, paddingVertical: spacing.md,
    backgroundColor: c.brandSecondary,
  },
  addText: { fontSize: 15, color: c.brand },
}));
