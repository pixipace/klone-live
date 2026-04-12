import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardDescription className="mb-4">
          Manage your account details
        </CardDescription>
        <div className="space-y-4">
          <Input label="Name" defaultValue="Klone User" />
          <Input label="Email" defaultValue="user@klone.live" type="email" />
          <Button size="sm">Save Changes</Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Password</CardTitle>
        <CardDescription className="mb-4">
          Update your password
        </CardDescription>
        <div className="space-y-4">
          <Input label="Current password" type="password" />
          <Input label="New password" type="password" />
          <Button size="sm">Change Password</Button>
        </div>
      </Card>

      <Card>
        <CardTitle className="text-error">Danger Zone</CardTitle>
        <CardDescription className="mb-4">
          Irreversible actions
        </CardDescription>
        <Button variant="danger" size="sm">Delete Account</Button>
      </Card>
    </div>
  );
}
