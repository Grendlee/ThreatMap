import { useState, useEffect } from 'react';                                                                                                      
  import { StyleSheet, View, Text } from 'react-native';                                                                                              
  import MapView from 'react-native-maps';                                                                                                            
  import * as Location from 'expo-location';                                                                                                          
                                                                                                                                                      
  export default function HomeScreen() {                                                                                                            
    const [location, setLocation] = useState(null);                                                                                                   
    const [errorMsg, setErrorMsg] = useState(null);                                                                                                   
                                                                                                                                                      
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
    }, []);

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
        />
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    map: {
      flex: 1,
    },
  });