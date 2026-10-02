import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { GearSix, Gift, House, MapTrifold, SealQuestion } from "phosphor-react-native";

import { fonts, useTheme } from "@/src/theme";

const isIOS26 =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

export default function TabsLayout() {
  const { colors } = useTheme();

  if (isIOS26) {
    const {
      NativeTabs,
      Icon,
      Label,
    } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf="calendar" />
          <Label>Oggi</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="da-verificare">
          <Icon sf="questionmark.circle" />
          <Label>Da Verificare</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="giri">
          <Icon sf="map" />
          <Label>Giri</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="ricorrenze">
          <Icon sf="gift" />
          <Label>Ricorrenze</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="impostazioni">
          <Icon sf="gearshape" />
          <Label>Altro</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Oggi",
          tabBarIcon: ({ color }) => <House size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="da-verificare"
        options={{
          title: "Da Verificare",
          tabBarIcon: ({ color }) => <SealQuestion size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="giri"
        options={{
          title: "Giri",
          tabBarIcon: ({ color }) => <MapTrifold size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="ricorrenze"
        options={{
          title: "Ricorrenze",
          tabBarIcon: ({ color }) => <Gift size={24} color={color} weight="fill" />,
        }}
      />
      <Tabs.Screen
        name="impostazioni"
        options={{
          title: "Altro",
          tabBarIcon: ({ color }) => <GearSix size={24} color={color} weight="fill" />,
        }}
      />
    </Tabs>
  );
}
