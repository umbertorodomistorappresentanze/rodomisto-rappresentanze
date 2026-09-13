import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CaretRight, FileXls, SignOut, Storefront, UserCircle } from "phosphor-react-native";

import { useAuth } from "@/src/auth";
import { AppText } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Impostazioni() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <AppText weight="bold" style={styles.title}>Altro</AppText>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <UserCircle size={34} color={colors.brand} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText weight="bold" style={styles.name}>{user?.display_name}</AppText>
            <AppText style={styles.username}>@{user?.username} · {isAdmin ? "Amministratore" : "Agente"}</AppText>
          </View>
        </View>

        <MenuItem
          icon={<FileXls size={22} color={colors.brand} weight="fill" />}
          label="Statistiche / Esportazione"
          onPress={() => router.push("/statistiche")}
          testID="menu-export"
        />
        {isAdmin ? (
          <MenuItem
            icon={<Storefront size={22} color={colors.brand} weight="fill" />}
            label="Gestisci aziende"
            onPress={() => router.push("/companies")}
            testID="menu-companies"
          />
        ) : null}
        <MenuItem
          icon={<SignOut size={22} color={colors.error} weight="bold" />}
          label="Esci"
          danger
          onPress={logout}
          testID="menu-logout"
        />
      </View>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, testID }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}>
      <View style={styles.itemIcon}>{icon}</View>
      <AppText weight="semibold" style={[styles.itemLabel, danger && { color: colors.error }]}>{label}</AppText>
      {!danger ? <CaretRight size={18} color={colors.muted} weight="bold" /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 24, color: c.onSurface },
  profile: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg,
  },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 17, color: c.onSurface },
  username: { fontSize: 13, color: c.muted, marginTop: 2 },
  item: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
    padding: spacing.lg, minHeight: 60,
  },
  itemIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  itemLabel: { fontSize: 16, color: c.onSurface, flex: 1 },
}));
