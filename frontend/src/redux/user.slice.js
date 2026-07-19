import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  userData: null,
  // Distinguishes "we have not checked yet" from "checked, nobody is signed in".
  // Without it the app flashes the login screen on every reload while the
  // silent refresh is still in flight.
  authChecked: false,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUserData: (state, action) => {
      state.userData = action.payload;
      state.authChecked = true;
    },
    clearUserData: (state) => {
      state.userData = null;
      state.authChecked = true;
    },
    setAuthChecked: (state) => {
      state.authChecked = true;
    },
  },
});

export const { setUserData, clearUserData, setAuthChecked } = userSlice.actions;

export default userSlice.reducer;
