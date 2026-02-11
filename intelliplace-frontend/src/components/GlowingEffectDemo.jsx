import { Box, Lock, Search, Settings, Sparkles } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

export function GlowingEffectDemo() {
    return (
        <ul className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-12 md:grid-rows-3 lg:gap-4 xl:max-h-[34rem] xl:grid-rows-2 p-6">
            <GridItem
                area="md:[grid-area:1/1/2/7] xl:[grid-area:1/1/2/5]"
                icon={<Box className="h-4 w-4" />}
                title="Robust Foundation"
                description="Built with industry-standard technologies for scale."
            />
            <GridItem
                area="md:[grid-area:1/7/2/13] xl:[grid-area:2/1/3/5]"
                icon={<Settings className="h-4 w-4" />}
                title="AI-Powered"
                description="Advanced algorithms to match the best talent."
            />
            <GridItem
                area="md:[grid-area:2/1/3/7] xl:[grid-area:1/5/3/8]"
                icon={<Lock className="h-4 w-4" />}
                title="Secure & Private"
                description="Enterprise-grade security for all data."
            />
            <GridItem
                area="md:[grid-area:2/7/3/13] xl:[grid-area:1/8/2/13]"
                icon={<Sparkles className="h-4 w-4" />}
                title="Modern UI/UX"
                description="Designed for seamless user experience."
            />
            <GridItem
                area="md:[grid-area:3/1/4/13] xl:[grid-area:2/8/3/13]"
                icon={<Search className="h-4 w-4" />}
                title="Smart Search"
                description="Find exactly what you're looking for instantly."
            />
        </ul>
    );
}

const GridItem = ({ area, icon, title, description }) => {
    return (
        <li className={cn("min-h-[14rem] list-none", area)}>
            <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-white/10 p-2 md:rounded-[1.5rem] md:p-3 bg-black/20">
                <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={3}
                />
                <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] border-white/5 bg-[#030712] p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)] md:p-6 z-10">
                    <div className="relative flex flex-1 flex-col justify-between gap-3">
                        <div className="w-fit rounded-lg border-[0.75px] border-white/10 bg-white/5 p-2 text-white">
                            {icon}
                        </div>
                        <div className="space-y-3">
                            <h3 className="pt-0.5 text-xl leading-[1.375rem] font-semibold font-sans tracking-[-0.04em] md:text-2xl md:leading-[1.875rem] text-balance text-white">
                                {title}
                            </h3>
                            <h2 className="font-sans text-sm leading-[1.125rem] md:text-base md:leading-[1.375rem] text-gray-400">
                                {description}
                            </h2>
                        </div>
                    </div>
                </div>
            </div>
        </li>
    );
};
