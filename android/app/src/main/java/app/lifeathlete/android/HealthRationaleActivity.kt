package app.lifeathlete.android

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import java.util.Locale

/**
 * Opened by Health Connect when the user taps the privacy policy link on the permission screen
 * (ACTION_SHOW_PERMISSIONS_RATIONALE, and VIEW_PERMISSION_USAGE on Android 14+). Shows the app's
 * public health privacy page in the browser and closes.
 */
class HealthRationaleActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val locale = if (Locale.getDefault().language == "en") "en" else "pt"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://lifeathlete.vercel.app/$locale/privacy/health"))
        intent.addCategory(Intent.CATEGORY_BROWSABLE)
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            // No browser installed: nothing to show.
        }
        finish()
    }
}
