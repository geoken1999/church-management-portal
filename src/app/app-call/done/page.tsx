// Where an in-app call lands once it's over; the mobile app closes its browser
// when it sees this address.
export default function AppCallDonePage() {
  return <p className="p-6 text-center text-sm text-muted-foreground">Call ended. You can close this.</p>;
}
