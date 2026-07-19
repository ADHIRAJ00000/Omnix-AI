/**
 * The access token, held in a module variable and nowhere else.
 *
 * Deliberately NOT localStorage or sessionStorage: anything stored there is
 * readable by any JavaScript running on the page, so a single cross-site
 * scripting bug — in our code or in any dependency — would hand an attacker a
 * working token. A module variable dies with the tab and is never persisted.
 *
 * The cost is that a page reload loses the token. That is fine: the refresh
 * cookie is httpOnly, survives the reload, and the app trades it for a new
 * access token on startup. The user never notices.
 *
 * Axios needs the token outside of React, so it lives here rather than in Redux.
 * Redux still holds the user for rendering; this holds the credential.
 */
let accessToken = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  accessToken = token;
};

export const clearAccessToken = () => {
  accessToken = null;
};
