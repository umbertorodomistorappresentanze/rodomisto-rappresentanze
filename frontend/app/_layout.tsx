import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/toast";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/auth";
import { SelectedGiroProvider } from "@/src/selected-giro";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({
    "PlusJakarta-Regular": require("../assets/fonts/PJS-400.ttf"),
    "PlusJakarta-Medium": require("../assets/fonts/PJS-500.ttf"),
    "PlusJakarta-SemiBold": require("../assets/fonts/PJS-600.ttf"),
    "PlusJakarta-Bold": require("../assets/fonts/PJS-700.ttf"),
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <SelectedGiroProvider>
                <BottomSheetModalProvider>
                  <ToastProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="select-giro" options={{ presentation: "modal" }} />
                      <Stack.Screen name="client/new" options={{ presentation: "modal" }} />
                      <Stack.Screen name="client/edit/[id]" options={{ presentation: "modal" }} />
                    </Stack>
                  </ToastProvider>
                </BottomSheetModalProvider>
              </SelectedGiroProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
