// Public app configuration. The OAuth Client ID is public by design: it only
// works from the origins authorised in Google Cloud Console.

export const GOOGLE_CLIENT_ID = '354443018222-145304faalmk919f6o34q9rt7udprak3.apps.googleusercontent.com';

// Google Picker (tarea 18): an API key restricted to this site (and
// localhost:5173) and to the Picker API alone, and the Cloud project number
// (setAppId). Both are public by design: the restrictions protect the key,
// and it reaches no data by itself. Were it empty, «Abrir un libro
// compartido conmigo» would say the app is not set up for it.
export const GOOGLE_API_KEY = 'AIzaSyDf27kYeZqyH3bTAE3EZSSyuiOKcGqcAzE';
export const GOOGLE_PROJECT_NUMBER = '354443018222';
