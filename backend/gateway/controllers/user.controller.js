/**
 * Returns the session the gateway already resolved, so the frontend can
 * rehydrate the signed-in user on page load without a database round trip.
 */
export const getCurrentUser = (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};
