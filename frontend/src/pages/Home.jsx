import ArtifactPanel from "../components/ArtifactPanel";
import ChatArea from "../components/ChatArea";
import Sidebar from "../components/Sidebar";

/**
 * The app itself. Sign-in is handled by /login and /register now, and
 * ProtectedRoute guarantees a user exists by the time this renders — so the
 * old "not signed in" modal that used to live here is gone.
 */
function Home() {
  return (
    <div className="h-screen flex bg-[#0d0f14] text-white overflow-hidden">
      <Sidebar />
      <ChatArea />
      <ArtifactPanel />
    </div>
  );
}

export default Home;
