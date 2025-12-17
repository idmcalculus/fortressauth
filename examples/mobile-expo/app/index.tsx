/**
 * FortressAuth Mobile Example - Main Screen
 * 
 * This code works identically with both SDKs:
 *   - @fortressauth/expo-sdk (uses SecureStore - encrypted)
 *   - @fortressauth/react-native-sdk (uses AsyncStorage)
 * 
 * Just change the import to switch between them!
 */
import { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
	Alert
} from 'react-native';
// For React Native CLI, change to: '@fortressauth/react-native-sdk'
import { useAuth, useUser } from '@fortressauth/expo-sdk';
import { StatusBar } from 'expo-status-bar';

export default function HomeScreen() {
	const { signIn, signUp, signOut } = useAuth();
	const { user, loading, error } = useUser();

	const [mode, setMode] = useState<'signin' | 'signup'>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');

	const handleSubmit = async () => {
		if (mode === 'signup') {
			if (password !== confirmPassword) {
				Alert.alert('Error', 'Passwords do not match');
				return;
			}
			await signUp(email, password);
		} else {
			await signIn(email, password);
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
			<Text style={styles.title}>🏰 FortressAuth Expo</Text>

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
							<Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
								Sign In
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.tab, mode === 'signup' && styles.tabActive]}
							onPress={() => setMode('signup')}
						>
							<Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
								Sign Up
							</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.form}>
						<Text style={styles.label}>Email</Text>
						<TextInput
							style={styles.input}
							value={email}
							onChangeText={setEmail}
							placeholder="your@email.com"
							placeholderTextColor="#a0aec0"
							autoCapitalize="none"
							keyboardType="email-address"
						/>

						<Text style={styles.label}>Password</Text>
						<TextInput
							style={styles.input}
							value={password}
							onChangeText={setPassword}
							placeholder="••••••••"
							placeholderTextColor="#a0aec0"
							secureTextEntry
						/>

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
								{mode === 'signin' ? 'Sign In' : 'Sign Up'}
							</Text>
						</TouchableOpacity>
					</View>

					{error && <Text style={styles.error}>{error}</Text>}
				</>
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
	title: {
		fontSize: 24,
		fontWeight: '600',
		color: '#f8f9fa',
		marginBottom: 30,
	},
	tabs: {
		flexDirection: 'row',
		marginBottom: 20,
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,255,255,0.1)',
	},
	tab: {
		flex: 1,
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
});
