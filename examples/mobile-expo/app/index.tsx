/**
 * FortressAuth Mobile Example - Main Screen
 *
 * This code works identically with both SDKs:
 *   - @fortressauth/expo-sdk (uses SecureStore - encrypted)
 *   - @fortressauth/react-native-sdk (uses AsyncStorage)
 *
 * Just change the import to switch between them!
 */

// For React Native CLI, change to: '@fortressauth/react-native-sdk'
import { useAuth, useUser } from '@fortressauth/expo-sdk';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function HomeScreen() {
  const { signIn, signUp, signOut, verifyEmail, requestPasswordReset, resetPassword } = useAuth();
  const { user, loading, error } = useUser();

  const [mode, setMode] = useState<'signin' | 'signup' | 'verify' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [showResetOverlay, setShowResetOverlay] = useState(false);

  const handleSubmit = async () => {
    setMessage('');
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
      const res = await signUp(email, password);
      if (res.success) setMessage('Verification email sent!');
    } else if (mode === 'signin') {
      await signIn(email, password);
    } else if (mode === 'verify') {
      const res = await verifyEmail(token);
      if (res.success) {
        setMessage('Email verified! You can now sign in.');
        setMode('signin');
      }
    } else if (mode === 'reset') {
      const res = await resetPassword(token, password);
      if (res.success) {
        setMessage('Password reset successful. Please sign in.');
        setMode('signin');
      }
    }
  };

  const handleRequestReset = async () => {
    const res = await requestPasswordReset(email);
    if (res.success) {
      Alert.alert('Success', 'Password reset email sent.');
      setShowResetOverlay(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4ecdc4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.logoEmoji}>🏰</Text>
        <Text style={styles.title}>FortressAuth Expo</Text>
      </View>

      {user ? (
        <View style={styles.success}>
          <Text style={styles.welcomeText}>
            Welcome, <Text style={styles.email}>{user.email}</Text>!
          </Text>
          <Text style={styles.verifyText}>
            Email verified: {user.emailVerified ? '✅ Yes' : '❌ No'}
          </Text>
          <TouchableOpacity style={styles.btnSecondary} onPress={signOut}>
            <Text style={styles.btnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'signin' && styles.tabActive]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'verify' && styles.tabActive]}
              onPress={() => setMode('verify')}
            >
              <Text style={[styles.tabText, mode === 'verify' && styles.tabTextActive]}>Verify</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'reset' && styles.tabActive]}
              onPress={() => setMode('reset')}
            >
              <Text style={[styles.tabText, mode === 'reset' && styles.tabTextActive]}>Reset</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
              <>
                <Text style={styles.label}>Email / User</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#a0aec0"
                  autoCapitalize="none"
                />
              </>
            )}

            {(mode === 'verify' || mode === 'reset') && (
              <>
                <Text style={styles.label}>Token</Text>
                <TextInput
                  style={styles.input}
                  value={token}
                  onChangeText={setToken}
                  placeholder="selector:verifier"
                  placeholderTextColor="#a0aec0"
                  autoCapitalize="none"
                />
              </>
            )}

            {(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
              <>
                <Text style={styles.label}>{mode === 'reset' ? 'New Password' : 'Password'}</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#a0aec0"
                  secureTextEntry
                />
              </>
            )}

            {mode === 'signup' && (
              <>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#a0aec0"
                  secureTextEntry
                />
              </>
            )}

            <TouchableOpacity style={styles.btnPrimary} onPress={handleSubmit}>
              <Text style={styles.btnPrimaryText}>
                {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : mode === 'verify' ? 'Verify' : 'Reset'}
              </Text>
            </TouchableOpacity>

            {mode === 'signin' && (
              <TouchableOpacity style={styles.forgotBtn} onPress={() => setShowResetOverlay(true)}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}

      {showResetOverlay && (
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSubtitle}>Enter email for reset link</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#a0aec0"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleRequestReset}>
              <Text style={styles.btnPrimaryText}>Send Reset Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowResetOverlay(false)}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f8f9fa',
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4ecdc4',
  },
  tabText: {
    color: '#a0aec0',
    fontSize: 14,
  },
  tabTextActive: {
    color: '#4ecdc4',
  },
  form: {
    width: '100%',
    maxWidth: 350,
  },
  label: {
    color: '#a0aec0',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: 14,
    color: '#f8f9fa',
    fontSize: 16,
    marginBottom: 16,
  },
  btnPrimary: {
    backgroundColor: '#4ecdc4',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnText: {
    color: '#f8f9fa',
    fontSize: 16,
  },
  forgotBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotText: {
    color: '#a0aec0',
    fontSize: 14,
  },
  success: {
    alignItems: 'center',
  },
  welcomeText: {
    color: '#f8f9fa',
    fontSize: 18,
  },
  email: {
    color: '#4ecdc4',
    fontWeight: '500',
  },
  verifyText: {
    color: '#a0aec0',
    marginTop: 10,
    marginBottom: 20,
  },
  error: {
    color: '#fc8181',
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    color: '#4ecdc4',
    marginTop: 16,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1e3a5f',
    width: '100%',
    maxWidth: 350,
    padding: 25,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8f9fa',
    marginBottom: 5,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#a0aec0',
    marginBottom: 20,
  },
});
