import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { api } from '../services/api';

const DeleteExerciseConfirmation = ({ exerciseId, onCancel, onDeleted }) => {
  const [deletionImpact, setDeletionImpact] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDeletionImpact = async () => {
      try {
        const impact = await api.get(`/exercises/${exerciseId}/deletion-impact`);
        setDeletionImpact(impact.data);
      } catch (err) {
        setError('Failed to fetch deletion impact.');
      }
    };

    fetchDeletionImpact();
  }, [exerciseId]);

  const handleDelete = async (forceDelete = false) => {
    try {
      await api.delete(`/exercises/${exerciseId}?forceDelete=${forceDelete}`);
      onDeleted();
    } catch (err) {
      setError('Failed to delete exercise.');
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Close" onPress={onCancel} />
      </View>
    );
  }

  if (!deletionImpact) {
    return (
      <View style={styles.container}>
        <Text>Loading deletion impact...</Text>
      </View>
    );
  }

  const {
    exerciseEntriesCount,
    workoutPlansCount,
    workoutPresetsCount,
    otherUserReferences,
  } = deletionImpact;

  const totalReferences = exerciseEntriesCount + workoutPlansCount + workoutPresetsCount;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delete Exercise</Text>
      <Text>This exercise is used in:</Text>
      <Text>- {exerciseEntriesCount} exercise entries</Text>
      <Text>- {workoutPlansCount} workout plans</Text>
      <Text>- {workoutPresetsCount} workout presets</Text>

      {otherUserReferences > 0 ? (
        <View>
          <Text style={styles.warningText}>
            This exercise is used by other users and cannot be deleted.
          </Text>
        </View>
      ) : totalReferences > 0 ? (
        <View>
          <Text style={styles.warningText}>
            This exercise is currently in use. To permanently delete it and all its references, use Force Delete.
          </Text>
          <Button title="Force Delete" color="red" onPress={() => handleDelete(true)} />
        </View>
      ) : (
        <View>
          <Text>This exercise is not currently in use and can be safely deleted.</Text>
          <Button title="Delete" color="red" onPress={() => handleDelete(false)} />
        </View>
      )}
      <Button title="Cancel" onPress={onCancel} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
  },
  warningText: {
    color: 'orange',
    marginVertical: 10,
  },
});

export default DeleteExerciseConfirmation;