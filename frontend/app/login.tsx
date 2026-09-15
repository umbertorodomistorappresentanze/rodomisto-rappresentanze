import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Lock, User } from "phosphor-react-native";

import { useAuth } from "@/src/auth";
import { AppText, Button } from "@/src/components/ui";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1532594722383-b75fb8381b55?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBmaWVsZCUyMHNhbGVzJTIwcm91dGUlMjBtYXB8ZW58MHx8fHwxNzg5MjQ0MjYwfDA&ixlib=rb-4.1.0&q=85";

const LOGO = require("../assets/images/logo.webp");

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e?.detail || "Accesso non riuscito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
          <LinearGradient
            colors={["rgba(4,120,87,0.15)", "rgba(255,255,255,0.4)", "#FFFFFF"]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.form}>
          <Image source={LOGO} style={styles.logo} contentFit="contain" />
          <AppText weight="bold" style={styles.title}>Bentornato</AppText>
          <AppText style={styles.sub}>Accedi per iniziare il tuo giro</AppText>

          <View style={styles.field}>
            <User size={20} color={colors.muted} weight="bold" />
            <TextInput
              testID="login-username"
              value={username}
              onChangeText={setUsername}
              placeholder="Nome utente (es. umberto)"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Lock size={20} color={colors.muted} weight="bold" />
            <TextInput
              testID="login-password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              onSubmitEditing={onSubmit}
            />
          </View>

          {error ? (
            <AppText testID="login-error" style={styles.error} weight="medium">{error}</AppText>
          ) : null}

          <Button
            title="Accedi"
            testID="login-submit"
            onPress={onSubmit}
            loading={busy}
            disabled={!username.trim() || !password}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = () =>
  useThemedStyles();

function useThemedStyles() {
  const { colors } = useTheme();
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    heroWrap: { height: 220, width: "100%" },
    hero: { width: "100%", height: "100%" },
    logo: { width: "100%", height: 170, marginTop: -spacing.sm, marginBottom: -spacing.md },
    form: { paddingHorizontal: spacing.lg, marginTop: -spacing.xl, gap: spacing.md },
    title: { fontSize: 28, color: colors.onSurface, fontFamily: fonts.bold },
    sub: { fontSize: 15, color: colors.muted, marginBottom: spacing.sm },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSecondary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      minHeight: 56,
    },
    input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.onSurface },
    error: { color: colors.error, fontSize: 14 },
  });
}
