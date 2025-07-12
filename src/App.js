import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

// Main App component
const App = () => {
    // State variables for Firebase and user authentication
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // State for inventory items
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // State for form inputs
    const [itemName, setItemName] = useState('');
    const [itemQuantity, setItemQuantity] = useState('');
    const [expirationDate, setExpirationDate] = useState('');
    const [editingItem, setEditingItem] = useState(null); // Stores item being edited

    // Firebase Initialization and Authentication
    useEffect(() => {
        try {
            // Retrieve Firebase config and app ID from global variables
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            // Initialize Firebase app
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestore);
            setAuth(firebaseAuth);

            // Listen for authentication state changes
            const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    // User is signed in
                    setUserId(user.uid);
                } else {
                    // User is signed out, sign in anonymously or with custom token
                    try {
                        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (initialAuthToken) {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (e) {
                        console.error("Error during anonymous sign-in or custom token sign-in:", e);
                        setError("Authentication failed. Please try again.");
                    }
                }
                setIsAuthReady(true); // Mark authentication as ready
            });

            // Cleanup subscription on unmount
            return () => unsubscribeAuth();
        } catch (e) {
            console.error("Error initializing Firebase:", e);
            setError("Failed to initialize the application. Please check your configuration.");
            setLoading(false);
        }
    }, []); // Empty dependency array ensures this runs only once on mount

    // Fetch and listen for real-time updates to items
    useEffect(() => {
        if (db && isAuthReady && userId) {
            setLoading(true);
            setError(null);
            // Define the collection path for public data
            const itemsCollectionRef = collection(db, `artifacts/${__app_id}/public/data/fridgeItems`);

            // Create a query to order by expirationDate
            const q = query(itemsCollectionRef, orderBy("expirationDate"));

            // Set up real-time listener
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedItems = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setItems(fetchedItems);
                setLoading(false);
            }, (err) => {
                console.error("Error fetching items:", err);
                setError("Failed to load inventory items. Please try again.");
                setLoading(false);
            });

            // Cleanup subscription on unmount
            return () => unsubscribe();
        } else if (isAuthReady && !userId) {
            // If auth is ready but userId is not set (e.g., anonymous sign-in failed), stop loading
            setLoading(false);
        }
    }, [db, isAuthReady, userId]); // Re-run when db, auth readiness, or userId changes

    // Handle form submission for adding/updating items
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!itemName || !itemQuantity || !expirationDate) {
            setError("Please fill in all fields.");
            return;
        }

        if (db && userId) {
            setLoading(true);
            setError(null);
            try {
                const itemsCollectionRef = collection(db, `artifacts/${__app_id}/public/data/fridgeItems`);
                const newItem = {
                    name: itemName,
                    quantity: parseInt(itemQuantity),
                    expirationDate: expirationDate,
                    userId: userId, // Store the userId who added/edited the item
                    createdAt: new Date().toISOString(),
                };

                if (editingItem) {
                    // Update existing item
                    const itemDocRef = doc(db, `artifacts/${__app_id}/public/data/fridgeItems`, editingItem.id);
                    await updateDoc(itemDocRef, newItem);
                    setEditingItem(null); // Clear editing state
                    console.log("Item updated successfully!");
                } else {
                    // Add new item
                    await addDoc(itemsCollectionRef, newItem);
                    console.log("Item added successfully!");
                }

                // Clear form fields after submission
                setItemName('');
                setItemQuantity('');
                setExpirationDate('');
            } catch (e) {
                console.error("Error adding/updating item:", e);
                setError("Failed to save item. Please try again.");
            } finally {
                setLoading(false);
            }
        } else {
            setError("Application not ready. Please wait or refresh.");
        }
    };

    // Function to set item for editing
    const handleEdit = (item) => {
        setEditingItem(item);
        setItemName(item.name);
        setItemQuantity(item.quantity.toString());
        setExpirationDate(item.expirationDate);
    };

    // Function to delete an item
    const handleDelete = async (id) => {
        if (db && userId) {
            setLoading(true);
            setError(null);
            try {
                const itemDocRef = doc(db, `artifacts/${__app_id}/public/data/fridgeItems`, id);
                await deleteDoc(itemDocRef);
                console.log("Item deleted successfully!");
            } catch (e) {
                console.error("Error deleting item:", e);
                setError("Failed to delete item. Please try again.");
            } finally {
                setLoading(false);
            }
        } else {
            setError("Application not ready. Please wait or refresh.");
        }
    };

    // Function to display a custom alert message
    const showAlert = (message) => {
        // In a real app, this would be a custom modal or toast notification
        // For this example, we'll just update the error state
        setError(message);
        setTimeout(() => setError(null), 3000); // Clear message after 3 seconds
    };

    // Helper to determine expiration status for styling
    const getExpirationStatus = (dateString) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day
        const expiration = new Date(dateString);
        expiration.setHours(0, 0, 0, 0); // Normalize expiration to start of day

        const diffTime = expiration.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return 'expired'; // Past expiration date
        } else if (diffDays <= 3) {
            return 'expiring-soon'; // Expires within 3 days
        } else {
            return 'fresh'; // More than 3 days
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-4 font-inter flex flex-col items-center">
            <div className="w-full max-w-md bg-white shadow-xl rounded-xl p-6 space-y-6">
                <h1 className="text-4xl font-extrabold text-center text-green-700 mb-6">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-blue-600">TELMI</span>
                </h1>
                <p className="text-center text-gray-600 mb-8">
                    Your smart fridge inventory. Reduce waste, save money!
                </p>

                {/* User ID Display */}
                {userId && (
                    <div className="text-sm text-center text-gray-500 mb-4 p-2 bg-gray-100 rounded-md">
                        User ID: <span className="font-mono break-all">{userId}</span>
                    </div>
                )}

                {/* Loading and Error Messages */}
                {loading && (
                    <div className="flex items-center justify-center p-4 text-blue-600">
                        <svg className="animate-spin h-5 w-5 mr-3 text-blue-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading...
                    </div>
                )}
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative" role="alert">
                        <strong className="font-bold">Error!</strong>
                        <span className="block sm:inline"> {error}</span>
                    </div>
                )}

                {/* Add/Edit Item Form */}
                <form onSubmit={handleSubmit} className="bg-white p-5 rounded-lg shadow-inner space-y-4">
                    <h2 className="text-2xl font-semibold text-gray-800 text-center mb-4">
                        {editingItem ? 'Edit Item' : 'Add New Item'}
                    </h2>
                    <div>
                        <label htmlFor="itemName" className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                        <input
                            type="text"
                            id="itemName"
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                            placeholder="e.g., Milk, Eggs, Apples"
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="itemQuantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                        <input
                            type="number"
                            id="itemQuantity"
                            value={itemQuantity}
                            onChange={(e) => setItemQuantity(e.target.value)}
                            placeholder="e.g., 1, 6, 2"
                            min="1"
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="expirationDate" className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
                        <input
                            type="date"
                            id="expirationDate"
                            value={expirationDate}
                            onChange={(e) => setExpirationDate(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        {editingItem ? 'Update Item' : 'Add Item'}
                    </button>
                    {editingItem && (
                        <button
                            type="button"
                            onClick={() => {
                                setEditingItem(null);
                                setItemName('');
                                setItemQuantity('');
                                setExpirationDate('');
                            }}
                            className="w-full mt-2 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
                        >
                            Cancel Edit
                        </button>
                    )}
                </form>

                {/* Inventory List */}
                <div className="bg-white p-5 rounded-lg shadow-inner space-y-4 mt-6">
                    <h2 className="text-2xl font-semibold text-gray-800 text-center mb-4">Your Fridge Inventory</h2>
                    {items.length === 0 && !loading && !error ? (
                        <p className="text-center text-gray-500">No items in your fridge yet. Add some!</p>
                    ) : (
                        <ul className="space-y-3">
                            {items.map((item) => {
                                const status = getExpirationStatus(item.expirationDate);
                                let statusClass = '';
                                let statusText = '';
                                if (status === 'expired') {
                                    statusClass = 'bg-red-100 border-red-400 text-red-700';
                                    statusText = 'Expired!';
                                } else if (status === 'expiring-soon') {
                                    statusClass = 'bg-yellow-100 border-yellow-400 text-yellow-700';
                                    statusText = 'Expiring Soon!';
                                } else {
                                    statusClass = 'bg-green-100 border-green-400 text-green-700';
                                    statusText = 'Fresh';
                                }

                                return (
                                    <li
                                        key={item.id}
                                        className={`flex items-center justify-between p-4 rounded-lg shadow-sm border ${statusClass}`}
                                    >
                                        <div className="flex-grow">
                                            <p className="text-lg font-medium text-gray-900">{item.name} ({item.quantity})</p>
                                            <p className="text-sm text-gray-600">Expires: {item.expirationDate}</p>
                                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${status === 'expired' ? 'bg-red-500 text-white' : status === 'expiring-soon' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white'}`}>
                                                {statusText}
                                            </span>
                                        </div>
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => handleEdit(item)}
                                                className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
                                                aria-label="Edit item"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
                                                aria-label="Delete item"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
