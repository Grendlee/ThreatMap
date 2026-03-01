# Intruder Threat Map

> Consensus intruder tracking — crowd-sourced, AI-powered, real-time.

A mobile app that helps people stay safe during active intruder situations by sharing live location pins, AI-generated suspect profiles, and a one-tap 911 assist.

> **Demo note:** A stapler is classified as a weapon for demo purposes.

## What it does

1. **Photograph** the intruder via the camera tab
2. **AI profiles** the suspect — Google Gemini detects weapons and describes appearance (clothing, hair, build, gender)
3. **Pin the location** — long-press the map to mark where the intruder was last seen; pins fade so the newest sighting is always clearest
4. **Call it in** — tap "Call Police" to have the suspect profile read aloud hands-free to 911

The map syncs in real time across all users so everyone sees the same picture.

## Tech stack

- React Native + Expo (iOS & Android)
- Google Gemini `gemini-3.1-flash-image-preview` — vision AI
- Supabase — Postgres, real-time subscriptions, photo storage
- Google Maps via `react-native-maps`
- `expo-location`, `expo-speech`, `expo-camera`

## Setup

```bash
npm install
npx expo start
```

Requires environment variables:
```
EXPO_PUBLIC_GEMINI_API_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_MAPS_API_KEY=...
```
