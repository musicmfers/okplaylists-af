// Spotify OAuth callback endpoint
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { code, state, error } = req.query

  console.log("Spotify callback received:", {
    code: !!code,
    state,
    error,
    cookies: req.cookies,
  })

  if (error) {
    console.error("Spotify auth error:", error)
    return res.redirect(`/?error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    console.error("Missing authorization code")
    return res.redirect("/?error=missing_code")
  }

  if (!state) {
    console.error("Missing state parameter")
    return res.redirect("/?error=missing_state")
  }

  // Validate state parameter
  const storedState = req.cookies.spotify_state
  console.log("State validation:", { received: state, stored: storedState })

  if (!storedState) {
    console.error("No stored state found in cookies")
    return res.redirect("/?error=no_stored_state")
  }

  if (state !== storedState) {
    console.error("State mismatch:", { received: state, stored: storedState })
    return res.redirect("/?error=state_mismatch")
  }

  try {
    const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
    const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
    const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      console.error("Missing environment variables")
      return res.redirect("/?error=server_configuration")
    }

    console.log("Exchanging code for token...")

    // Exchange code for access token
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Token exchange failed:", tokenResponse.status, errorText)
      throw new Error(`Token exchange failed: ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful")

    // Set secure cookies with tokens
    const cookieOptions = "HttpOnly; Secure; SameSite=None; Path=/"

    res.setHeader("Set-Cookie", [
      `spotify_access_token=${tokenData.access_token}; ${cookieOptions}; Max-Age=3600`,
      `spotify_refresh_token=${tokenData.refresh_token}; ${cookieOptions}; Max-Age=2592000`,
      `spotify_expires_in=${tokenData.expires_in}; ${cookieOptions}; Max-Age=3600`,
      `spotify_state=; ${cookieOptions}; Max-Age=0`, // Clear the state cookie
    ])

    // Redirect back to main app with success
    res.redirect("/?spotify_connected=true")
  } catch (error) {
    console.error("Spotify callback error:", error)
    res.redirect(`/?error=${encodeURIComponent("authentication_failed")}`)
  }
}
