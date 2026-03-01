import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Speech from 'expo-speech';
import MapView, { Callout, Marker } from 'react-native-maps';
import { supabase } from '../../lib/supabase';

type Pin = { key: string; id: string; latitude: number; longitude: number; device_id: string };
type PhotoPin = { id: string; latitude: number; longitude: number; file_path: string };

const BUCKET_URL = 'https://zvoigorhaijuyqtbbyrl.supabase.co/storage/v1/object/public/ThreatPhoto';

const MIN_OPACITY = 0.05;
const MAX_OPACITY = 1.0;

function pinOpacity(index: number, total: number) {
  if (total <= 1) return MAX_OPACITY;
  return MIN_OPACITY + (index / (total - 1)) * (MAX_OPACITY - MIN_OPACITY);
}

function DroppingPin({
  coordinate,
  targetOpacity,
}: {
  coordinate: { latitude: number; longitude: number };
  targetOpacity: number;
}) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(targetOpacity)).current;
  const [tracking, setTracking] = useState(true);
  const mounted = useRef(false);

  useEffect(() => {
    // Drop animation on first mount
    opacity.setValue(1);
    Animated.timing(translateY, {
      toValue: 0,
      useNativeDriver: false,
      duration: 200,
    }).start(() => {
      Animated.timing(opacity, {
        toValue: targetOpacity,
        useNativeDriver: false,
        duration: 400,
      }).start(() => setTimeout(() => setTracking(false), 100));
    });
    mounted.current = true;
  }, []);

  useEffect(() => {
    if (!mounted.current) return;
    setTracking(true);
    Animated.timing(opacity, {
      toValue: targetOpacity,
      useNativeDriver: false,
      duration: 400,
    }).start(() => setTimeout(() => setTracking(false), 100));
  }, [targetOpacity]);

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracking}>
      <Animated.View style={{ transform: [{ translateY }], opacity, alignItems: 'center' }}>
        <View style={styles.pinHead} />
        <View style={styles.pinTip} />
      </Animated.View>
    </Marker>
  );
}

const PhotoThumbnailPin = React.memo(function PhotoThumbnailPin({
  coordinate,
  photoUrl,
}: {
  coordinate: { latitude: number; longitude: number };
  photoUrl: string;
}) {
  const [tracking, setTracking] = useState(true);

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={tracking}>
      <View style={{ alignItems: 'center' }}>
        <Image
          source={{ uri: photoUrl }}
          style={styles.thumbnailImage}
          onLoad={() => setTimeout(() => setTracking(false), 150)}
        />
        <View style={styles.photoPinTip} />
      </View>
      <Callout tooltip={false}>
        <Image source={{ uri: photoUrl }} style={styles.calloutImage} />
      </Callout>
    </Marker>
  );
});

export default function HomeScreen() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [photoPins, setPhotoPins] = useState<PhotoPin[]>([]);
  const [suspectLines, setSuspectLines] = useState<string[]>([]);
  const [suspectPhotoUrl, setSuspectPhotoUrl] = useState<string | null>(null);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [deviceId, setDeviceId] = useState<string>('');
  const deviceIdRef = useRef<string>('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();

    (async () => {
      let id = await AsyncStorage.getItem('device_id');
      if (!id) {
        id = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await AsyncStorage.setItem('device_id', id);
      }
      setDeviceId(id);
      deviceIdRef.current = id;
      loadPins();
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPins();
      loadPhotoPins();
      loadSuspectProfile();

      const channel = supabase
        .channel('map_pins_live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'map_pins' }, (payload: any) => {
          // Only reload if the pin came from another device
          if (payload.new?.device_id !== deviceIdRef.current) {
            loadPins();
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }, [])
  );

  const loadPins = async () => {
    const { data } = await supabase
      .from('map_pins')
      .select('id, latitude, longitude, device_id')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!data) return;
    // Group by device, keep newest 5 per device, then reverse so oldest=index 0 (faded), newest=last (dark)
    const byDevice: Record<string, typeof data> = {};
    for (const p of data) {
      const key = p.device_id ?? 'unknown';
      if (!byDevice[key]) byDevice[key] = [];
      if (byDevice[key].length < 5) byDevice[key].push(p);
    }
    const all = Object.values(byDevice).flatMap((group) =>
      [...group].reverse().map((p) => ({ ...p, key: p.id, device_id: p.device_id ?? 'unknown' }))
    );
    setPins(all);
  };

  const loadSuspectProfile = async () => {
    const { data } = await supabase
      .from('threat_photos')
      .select('appearance, file_path, has_clear_view')
      .eq('is_threat', true)
      .not('appearance', 'is', null)
      .order('has_clear_view', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      // Best photo: prefer has_clear_view = true, otherwise most recent
      setSuspectPhotoUrl(`${BUCKET_URL}/${data[0].file_path}`);

      const seen = new Set<string>();
      const lines: string[] = [];
      for (const { appearance } of data) {
        if (!appearance || lines.length >= 10) break;
        for (const line of appearance.split('\n').filter(Boolean)) {
          const clean = line.replace(/^[-•]\s*/, '').trim().toLowerCase();
          if (!seen.has(clean)) {
            seen.add(clean);
            lines.push(line.replace(/^[-•]\s*/, '').trim());
            if (lines.length >= 10) break;
          }
        }
      }
      setSuspectLines(lines);
    }
  };

  const loadPhotoPins = async () => {
    const { data } = await supabase
      .from('threat_photos')
      .select('id, latitude, longitude, file_path')
      .not('latitude', 'is', null);
    if (data) setPhotoPins(data);
  };

  const handleMapPress = async (e: any) => {
    if (!deviceId) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const tempId = `temp-${Date.now()}`;

    // Optimistically add pin, keeping max 5 for this device
    setPins((prev) => {
      const others = prev.filter((p) => p.device_id !== deviceId);
      const mine = prev.filter((p) => p.device_id === deviceId).slice(-4);
      return [...others, ...mine, { key: tempId, id: tempId, latitude, longitude, device_id: deviceId }];
    });

    const { data, error } = await supabase
      .from('map_pins')
      .insert({ latitude, longitude, device_id: deviceId })
      .select('id, latitude, longitude, device_id')
      .single();

    if (!error && data) {
      setPins((prev) => prev.map((p) => (p.key === tempId ? { ...data, key: tempId, device_id: deviceId } : p)));
    } else {
      console.warn('Failed to save pin:', error?.message);
    }
  };

  const handleCallPolice = () => {
    Speech.stop();
    const text = `Suspect profile alert. ${suspectLines.join('. ')}`;
    Speech.speak(text, { language: 'en', rate: 0.9, pitch: 1.0 });
  };

  if (errorMsg) return <Text>{errorMsg}</Text>;
  if (!location) return <Text>Getting location...</Text>;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider="google"
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.0075,
          longitudeDelta: 0.0075,
        }}
        showsUserLocation={true}
        zoomTapEnabled={false}
        onLongPress={handleMapPress}
      >
        {(() => {
          const byDevice: Record<string, Pin[]> = {};
          for (const p of pins) {
            if (!byDevice[p.device_id]) byDevice[p.device_id] = [];
            byDevice[p.device_id].push(p);
          }
          return pins.map((pin) => {
            const devicePins = byDevice[pin.device_id] ?? [];
            const idx = devicePins.findIndex((p) => p.key === pin.key);
            return (
              <DroppingPin
                key={pin.key}
                coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                targetOpacity={pinOpacity(idx, devicePins.length)}
              />
            );
          });
        })()}
        {photoPins.map((pin) => {
          const photoUrl = `https://zvoigorhaijuyqtbbyrl.supabase.co/storage/v1/object/public/ThreatPhoto/${pin.file_path}`;
          return (
            <PhotoThumbnailPin
              key={`photo-${pin.id}`}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              photoUrl={photoUrl}
            />
          );
        })}
      </MapView>
      {hintVisible && (
        <TouchableOpacity style={styles.hint} onPress={() => setHintVisible(false)} activeOpacity={0.8}>
          <Text style={styles.hintText}>📍 Long press to pin the threats location</Text>
          <Text style={styles.hintDismiss}>✕</Text>
        </TouchableOpacity>
      )}
      {suspectLines.length > 0 && (
        <View style={styles.suspectCard}>
          <Text style={styles.suspectTitle}>⚠️ Suspect Profile</Text>
          <View style={styles.suspectBody}>
            {suspectPhotoUrl && (
              <Image source={{ uri: suspectPhotoUrl }} style={styles.suspectPhoto} resizeMode="cover" />
            )}
            <View style={styles.suspectText}>
              <View style={!profileExpanded && { height: 60, overflow: 'hidden' }}>
                {suspectLines.map((line, i) => (
                  <Text key={i} style={styles.suspectEntry}>• {line}</Text>
                ))}
              </View>
              <TouchableOpacity onPress={() => setProfileExpanded((v) => !v)}>
                <Text style={styles.suspectShowMore}>
                  {profileExpanded ? 'Show less ▲' : 'Show more ▼'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.callButton} onPress={handleCallPolice}>
              <Text style={styles.callButtonIcon}>🚨</Text>
              <Text style={styles.callButtonText}>Call{'\n'}Police</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  hint: {
    position: 'absolute',
    bottom: 36,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hintText: {
    color: 'white',
    fontSize: 13,
    flex: 1,
  },
  hintDismiss: {
    color: '#aaa',
    fontSize: 13,
    marginLeft: 8,
  },
  suspectCard: {
    position: 'absolute',
    top: 55,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(42, 0, 0, 0.92)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#8B0000',
  },
  suspectTitle: {
    color: '#ff4444',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  suspectBody: {
    flexDirection: 'row',
    gap: 10,
  },
  suspectPhoto: {
    width: 70,
    height: 85,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#8B0000',
  },
  suspectText: {
    flex: 1,
    justifyContent: 'space-between',
  },
  suspectEntry: {
    color: '#ffcccc',
    fontSize: 13,
    marginBottom: 3,
  },
  suspectShowMore: {
    color: '#ff8888',
    fontSize: 12,
    marginTop: 4,
  },
  callButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#cc0000',
    borderRadius: 10,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    minWidth: 60,
  },
  callButtonIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  callButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  pinHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'red',
    borderWidth: 2,
    borderColor: 'white',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'red',
  },
  thumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#f61010',
  },
  photoPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#8B0000',
  },
  calloutImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
});
