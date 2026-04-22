import { NextRequest, NextResponse } from "next/server";
import { upsertSocialAccountForCurrentUser } from "@/lib/social-account";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${encodeURIComponent(
        errorDescription || error
      )}`
    );
  }

  const csrfState = request.cookies.get("facebook_csrf")?.value;
  if (!state || state !== csrfState) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=invalid_state`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=no_code`
    );
  }

  try {
    // Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", process.env.META_APP_ID!);
    tokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    tokenUrl.searchParams.set(
      "redirect_uri",
      `${process.env.NEXTAUTH_URL}/auth/facebook/callback`
    );
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Meta token error:", tokenData.error);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=${encodeURIComponent(
          tokenData.error.message || "token_error"
        )}`
      );
    }

    const shortToken = tokenData.access_token;

    // Long-lived token (60 days)
    const longTokenUrl = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", process.env.META_APP_ID!);
    longTokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    longTokenUrl.searchParams.set("fb_exchange_token", shortToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token || shortToken;

    // Get user info
    const userRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,picture&access_token=${accessToken}`
    );
    const userData = await userRes.json();

    // Get pages with linked Instagram Business accounts
    const pagesRes = await fetch(
      `https://graph.facebook.com/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();

    // Build Facebook account data — use first page name as display name
    const firstPage = pagesData.data?.[0];
    const facebookAccount = JSON.stringify({
      platform: "facebook",
      accessToken,
      userId: userData.id,
      userName: userData.name, // personal user name
      username: firstPage?.name || userData.name, // display: page name if available
      avatar: userData.picture?.data?.url || "",
      pages: pagesData.data || [],
      expiresAt: longTokenData.expires_in
        ? Date.now() + longTokenData.expires_in * 1000
        : null,
    });

    // Build Instagram account data (all pages with linked IG accounts)
    const igAccounts = (pagesData.data || [])
      .filter(
        (p: { instagram_business_account?: unknown }) =>
          p.instagram_business_account
      )
      .map(
        (p: {
          id: string;
          name: string;
          instagram_business_account: {
            id: string;
            username?: string;
            profile_picture_url?: string;
            followers_count?: number;
          };
        }) => ({
          instagramId: p.instagram_business_account.id,
          pageId: p.id,
          pageName: p.name,
          username: p.instagram_business_account.username || p.name,
          avatar: p.instagram_business_account.profile_picture_url || "",
          followers: p.instagram_business_account.followers_count || 0,
        })
      );

    const instagramAccount =
      igAccounts.length > 0
        ? JSON.stringify({
            platform: "instagram",
            accessToken,
            userId: userData.id,
            accounts: igAccounts,
            // Default selected = first
            username: igAccounts[0].username,
            avatar: igAccounts[0].avatar,
            followers: igAccounts[0].followers,
            instagramId: igAccounts[0].instagramId,
            pageId: igAccounts[0].pageId,
            expiresAt: longTokenData.expires_in
              ? Date.now() + longTokenData.expires_in * 1000
              : null,
          })
        : null;

    const expiresAtDate = longTokenData.expires_in
      ? new Date(Date.now() + longTokenData.expires_in * 1000)
      : null;

    await upsertSocialAccountForCurrentUser({
      platform: "facebook",
      accessToken,
      expiresAt: expiresAtDate,
      externalId: userData.id ?? null,
      username: firstPage?.name || userData.name || null,
      avatar: userData.picture?.data?.url ?? null,
      meta: {
        userName: userData.name,
        pages: pagesData.data || [],
      },
    });

    if (igAccounts.length > 0) {
      await upsertSocialAccountForCurrentUser({
        platform: "instagram",
        accessToken,
        expiresAt: expiresAtDate,
        externalId: igAccounts[0].instagramId ?? null,
        username: igAccounts[0].username,
        avatar: igAccounts[0].avatar,
        meta: {
          accounts: igAccounts,
          selectedInstagramId: igAccounts[0].instagramId,
          selectedPageId: igAccounts[0].pageId,
          followers: igAccounts[0].followers,
        },
      });
    }

    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?connected=meta`
    );

    response.cookies.set("facebook_account", facebookAccount, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 60,
    });

    if (instagramAccount) {
      response.cookies.set("instagram_account", instagramAccount, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 60,
      });
    }

    return response;
  } catch (err) {
    console.error("Meta OAuth error:", err);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard/accounts?error=token_exchange_failed`
    );
  }
}
