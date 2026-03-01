import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { analyzePhotoForThreat } from '../../lib/gemini';
import { supabase } from '../../lib/supabase';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState(false);
  const cameraRef = useRef(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationPermission(status === 'granted');
    });
  }, []);

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photoResult = await (cameraRef.current as any).takePictureAsync({
      quality: 0.2,
    });
    setPhoto(photoResult.uri);
    setSaveError(null);

    if (locationPermission) {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((loc) => {
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      });
    }
  };

  const retake = () => {
    setPhoto(null);
    setLocation(null);
    setSaveError(null);
  };

  const savePhoto = async () => {
    if (!photo) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fileName = `threat-${Date.now()}.jpg`;

      let base64 = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        base64 = await FileSystem.readAsStringAsync(photo, { encoding: 'base64' });
        if (base64 && base64.length > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!base64 || base64.length === 0) throw new Error('Could not read photo');

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: storageError } = await supabase.storage
        .from('ThreatPhoto')
        .upload(fileName, bytes, { contentType: 'image/jpeg' });
      if (storageError) throw storageError;

      const { data: dbData, error: dbError } = await supabase
        .from('threat_photos')
        .insert({
          file_path: fileName,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        })
        .select('id')
        .single();
      if (dbError) throw dbError;

      // Analyze in background — don't block the UI
      const rowId = dbData.id;
      analyzePhotoForThreat(base64).then(async (analysis) => {
        const { error } = await supabase.from('threat_photos').update({
          is_threat: analysis.isThreat,
          ai_description: analysis.description,
          appearance: analysis.appearance,
          has_clear_view: analysis.hasClearView,
        }).eq('id', rowId);
        if (error) console.warn('Gemini update failed:', error.message);
      }).catch((err) => console.warn('Gemini analysis failed:', err.message));

      setPhoto(null);
      setLocation(null);
    } catch (err: any) {
      setSaveError(err.message ?? 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'black' }}>Camera permission required</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  if (photo) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photo }} style={styles.preview} />
        {location && (
          <View style={styles.locationBadge}>
            <Text style={styles.locationText}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </Text>
          </View>
        )}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionButton, styles.retakeButton]} onPress={retake} disabled={saving}>
            <Text style={styles.actionText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={savePhoto} disabled={saving}>
            {saving ? <ActivityIndicator color="white" /> : <Text style={[styles.actionText, { color: 'white' }]}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} mirror={facing === 'front'} ref={cameraRef} />
      <TouchableOpacity style={styles.flipButton} onPress={() => setFacing((f) => f === 'front' ? 'back' : 'front')}>
        <Text style={styles.flipText}>⟳</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.shutterButton} onPress={takePhoto}>
        <Text style={styles.shutterText}>Take Photo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  flipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipText: {
    color: 'white',
    fontSize: 24,
  },
  shutterButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  shutterText: { fontSize: 16, fontWeight: '600', color: 'black' },
  preview: { flex: 1 },
  locationBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  locationText: { color: 'white', fontSize: 13 },
  errorText: { color: 'red', textAlign: 'center', paddingVertical: 8, backgroundColor: 'black' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 24,
    backgroundColor: 'black',
  },
  actionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    minWidth: 130,
    alignItems: 'center',
  },
  retakeButton: { backgroundColor: '#333' },
  saveButton: { backgroundColor: '#2563eb' },
  actionText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
