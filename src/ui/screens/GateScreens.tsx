import { Brand, SavedLine } from "../components/Chrome";
import { MessageState } from "../components/States";

export function NotMemberScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="screen">
      <Brand word="FLOR" />
      <div className="scroll">
        <MessageState
          title="You're not on a workspace yet"
          message="This Google account isn't a member of a FLOR workspace. Ask your clinic admin for an invite."
          action="Sign out"
          onAction={onSignOut}
        />
      </div>
      <SavedLine />
    </main>
  );
}
