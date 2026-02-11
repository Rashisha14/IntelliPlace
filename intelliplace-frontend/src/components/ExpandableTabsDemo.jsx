import { Bell, Home, HelpCircle, Settings, Shield, Mail, User, FileText, Lock } from "lucide-react";
import { ExpandableTabs } from "@/components/ui/expandable-tabs";

function DefaultDemo() {
    const tabs = [
        { title: "Dashboard", icon: Home },
        { title: "Notifications", icon: Bell },
        { type: "separator" },
        { title: "Settings", icon: Settings },
        { title: "Support", icon: HelpCircle },
        { title: "Security", icon: Shield },
    ];

    return (
        <div className="flex flex-col gap-4">
            <ExpandableTabs tabs={tabs} />
        </div>
    );
}

function CustomColorDemo() {
    const tabs = [
        { title: "Profile", icon: User },
        { title: "Messages", icon: Mail },
        { type: "separator" },
        { title: "Documents", icon: FileText },
        { title: "Privacy", icon: Lock },
    ];

    return (
        <div className="flex flex-col gap-4">
            <ExpandableTabs
                tabs={tabs}
                activeColor="text-blue-500"
                className="border-blue-200 dark:border-blue-800"
            />
        </div>
    );
}

export function ExpandableTabsDemo() {
    return (
        <div className="space-y-12 p-8 border border-white/10 rounded-xl bg-black/20">
            <div>
                <h3 className="text-xl font-bold text-white mb-4">Default Tabs</h3>
                <DefaultDemo />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-4">Custom Color Tabs</h3>
                <CustomColorDemo />
            </div>
        </div>
    )
}

export { DefaultDemo, CustomColorDemo };
