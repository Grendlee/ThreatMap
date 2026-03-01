import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Photo = {
  id: string;
  file_path: string;
  is_threat: boolean | null;
  ai_description: string | null;
  appearance: string | null;
  created_at: string;
};

const BUCKET_URL = 'https://zvoigorhaijuyqtbbyrl.supabase.co/storage/v1/object/public/ThreatPhoto';
const CARD_HEIGHT = 200;

function BulletLines({ text, style }: { text: string; style: any }) {
  return (
    <>
      {text.split('\n').filter(Boolean).map((line, i) => (
        <Text key={i} style={style}>• {line.replace(/^[-•]\s*/, '').trim()}</Text>
      ))}
    </>
  );
}

function PhotoCard({ item }: { item: Photo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Image
        source={{ uri: `${BUCKET_URL}/${item.file_path}` }}
        style={styles.thumbnail}
      />
      <View style={[styles.cardRight, !expanded && { height: CARD_HEIGHT }]}>
        <View style={styles.cardBody}>
          {item.is_threat === null ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Analyzing...</Text>
            </View>
          ) : item.is_threat ? (
            <View style={[styles.badge, styles.threatBadge]}>
              <Text style={styles.badgeText}>⚠️ Threat</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.clearBadge]}>
              <Text style={styles.badgeText}>✓ Clear</Text>
            </View>
          )}
          {item.ai_description
            ? <BulletLines text={item.ai_description} style={styles.description} />
            : null}
          {item.appearance
            ? <BulletLines text={item.appearance} style={styles.appearance} />
            : null}
        </View>
        {(item.ai_description || item.appearance) ? (
          <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.showMore}>
            <Text style={styles.showMoreText}>{expanded ? 'Show less ▲' : 'Show more ▼'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function PhotosScreen() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadPhotos();

      const channel = supabase
        .channel('threat_photos_live')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'threat_photos' }, () => {
          loadPhotos();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }, [])
  );

  const loadPhotos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('threat_photos')
      .select('id, file_path, is_threat, ai_description, appearance, created_at')
      .order('is_threat', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (data) setPhotos(data);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#fff" />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <PhotoCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  list: { padding: 12, gap: 12 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 200,
    height: 200,
  },
  cardRight: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  cardBody: {
    flex: 1,
    padding: 10,
    gap: 4,
    overflow: 'hidden',
  },
  showMore: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  showMoreText: {
    color: '#888',
    fontSize: 11,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  threatBadge: { backgroundColor: '#8B0000' },
  clearBadge: { backgroundColor: '#1a5c2a' },
  badgeText: { color: 'white', fontSize: 12, fontWeight: '600' },
  description: { color: '#ccc', fontSize: 12 },
  appearance: { color: '#aaa', fontSize: 12, fontStyle: 'italic' },
});
