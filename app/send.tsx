import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SendScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send</Text>
      <Text style={styles.subtitle}>Lightning and Solana bridging coming in Phase 2.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
  },
  subtitle: {
    color: '#8f8f9d'
  }
});
