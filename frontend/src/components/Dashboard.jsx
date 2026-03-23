import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
    Bar,
    BarChart,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    AreaChart,
    Area,
} from "recharts";
const API_BASE = import.meta.env.VITE_API_URL;
const API_URL = `${API_BASE}/activities`;
const POLL_MS = 5000;
const POLL_SECONDS = 5;
const PRODUCTIVE_APPS = new Set([
    "VS Code",
    "JetBrains IDE",
    "Excel",
    "Word",
    "PowerPoint",
    "Outlook",
    "Teams",
    "Slack",
    "Figma",
    "Git",
    "API Client",
    "Docker",
    "Jupyter",
    "Terminal",
]);
const IDLE_ALERT_SECONDS = 10 * 60;
const DEEP_WORK_MIN_SECONDS = 20 * 60;
const SESSION_GAP_SECONDS = 10 * 60;
const IDLE_INTERRUPT_THRESHOLD_SECONDS = 120;
const SCORE_WEIGHTS = {
    focus: 0.4,
    appQuality: 0.3,
    consistency: 0.2,
    idle: 0.1,
};
const APP_CATEGORIES = {
    productive: [
        "VS Code",
        "JetBrains IDE",
        "PyCharm",
        "IntelliJ",
        "Jupyter",
        "Notebook",
        "Anaconda",
        "TensorFlow",
        "Kaggle",
        "Colab",
        "Terminal",
        "Command Prompt",
        "PowerShell",
        "Git Bash",
        "Excel",
        "Word",
        "PowerPoint",
        "Outlook",
        "Slack",
        "Teams",
        "Zoom",
        "Meet",
        "Figma",
        "Git",
        "API Client",
        "Docker",
    ],
    neutral: [
        "File Explorer",
        "Settings",
        "Task Manager",
        "Control Panel",
        "Search",
        "Program Manager",
        "Windows Explorer",
        "Chrome",
        "Edge",
        "Firefox",
    ],
    unproductive: [
        "YouTube",
        "Instagram",
        "Facebook",
        "Twitter",
        "Netflix",
        "Hotstar",
        "Prime Video",
        "WhatsApp",
        "Telegram",
        "Media Player",
        "Spotify",
        "Game",
        "Steam",
    ],
};
const PRODUCTIVE_URLS = [
    "github",
    "notion",
    "docs.google",
    "kaggle",
    "colab",
    "stackoverflow",
    "gitlab",
    "jira",
    "confluence",
    "figma",
];
const UNPRODUCTIVE_URLS = [
    "youtube",
    "instagram",
    "netflix",
    "twitter",
    "facebook",
    "hotstar",
    "prime video",
    "spotify",
];
const chartColors = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444"];
function formatDuration(seconds) {
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.round((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
    if (seconds >= 60) {
        const minutes = Math.round(seconds / 60);
        return `${minutes} min`;
    }
    return `${seconds} sec`;
}
function formatDelta(seconds) {
    const sign = seconds >= 0 ? "+" : "-";
    return `${sign}${formatDuration(Math.abs(seconds))}`;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function isIdleItem(item) {
    if (!item) {
        return false;
    }
    if (item.is_idle === true) {
        return true;
    }
    if (typeof item.idle_seconds === "number") {
        return item.idle_seconds >= IDLE_INTERRUPT_THRESHOLD_SECONDS;
    }
    return false;
}
function buildSparklinePoints(values, width, height) {
    if (!values || values.length === 0) {
        return "";
    }
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    return values
        .map((value, index) => {
            const x = (index / (values.length - 1 || 1)) * width;
            const y = height - ((value - min) / span) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
}
function formatTime(timestamp) {
    if (!timestamp) {
        return "Unknown";
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }
    return date.toLocaleTimeString();
}
function cleanAppName(name) {
    if (!name) {
        return "Unknown";
    }
    const lower = name.toLowerCase();
    const mappings = [
        { match: /visual studio code|vscode|code\.exe/, label: "VS Code" },
        { match: /intellij|pycharm|webstorm|datagrip|clion|goland|rider/, label: "JetBrains IDE" },
        { match: /chrome|chromium/, label: "Chrome" },
        { match: /msedge|edge/, label: "Edge" },
        { match: /firefox/, label: "Firefox" },
        { match: /safari/, label: "Safari" },
        { match: /explorer|file explorer/, label: "Explorer" },
        { match: /terminal|powershell|cmd\.exe|windows terminal/, label: "Terminal" },
        { match: /slack/, label: "Slack" },
        { match: /teams|microsoft teams/, label: "Teams" },
        { match: /zoom/, label: "Zoom" },
        { match: /outlook/, label: "Outlook" },
        { match: /word/, label: "Word" },
        { match: /excel/, label: "Excel" },
        { match: /powerpoint/, label: "PowerPoint" },
        { match: /notepad\+\+|notepad/, label: "Notepad" },
        { match: /figma/, label: "Figma" },
        { match: /photoshop|illustrator|after effects|premiere/, label: "Adobe" },
        { match: /github|gitkraken|sourcetree/, label: "Git" },
        { match: /postman|insomnia/, label: "API Client" },
        { match: /docker/, label: "Docker" },
        { match: /jupyter|anaconda/, label: "Jupyter" },
        { match: /spotify|youtube music|apple music/, label: "Music" },
    ];
    for (const rule of mappings) {
        if (rule.match.test(lower)) {
            return rule.label;
        }
    }
    const parts = name.split(" - ");
    return parts[0] || name;
}
function getCategory(appName) {
    if (!appName) {
        return "neutral";
    }
    const name = appName.toLowerCase();
    if (PRODUCTIVE_URLS.some((url) => name.includes(url))) {
        return "productive";
    }
    if (UNPRODUCTIVE_URLS.some((url) => name.includes(url))) {
        return "unproductive";
    }
    if (APP_CATEGORIES.productive.some((app) => name.includes(app.toLowerCase()))) {
        return "productive";
    }
    if (APP_CATEGORIES.unproductive.some((app) => name.includes(app.toLowerCase()))) {
        return "unproductive";
    }
    return "neutral";
}
function computeDeepWork(items) {
    if (!items || items.length === 0) {
        return { deepWorkSeconds: 0, maxSessionSeconds: 0 };
    }
    const ordered = [...items].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let deepWorkSeconds = 0;
    let maxSessionSeconds = 0;
    let currentApp = null;
    let currentSeconds = 0;
    for (const item of ordered) {
        if (isIdleItem(item)) {
            if (currentSeconds >= DEEP_WORK_MIN_SECONDS) {
                deepWorkSeconds += currentSeconds;
                maxSessionSeconds = Math.max(maxSessionSeconds, currentSeconds);
            }
            currentApp = null;
            currentSeconds = 0;
            continue;
        }
        const app = cleanAppName(item.active_window || "Unknown");
        if (currentApp !== app) {
            if (currentSeconds >= DEEP_WORK_MIN_SECONDS) {
                deepWorkSeconds += currentSeconds;
                maxSessionSeconds = Math.max(maxSessionSeconds, currentSeconds);
            }
            currentApp = app;
            currentSeconds = POLL_SECONDS;
        } else {
            currentSeconds += POLL_SECONDS;
        }
    }
    if (currentSeconds >= DEEP_WORK_MIN_SECONDS) {
        deepWorkSeconds += currentSeconds;
        maxSessionSeconds = Math.max(maxSessionSeconds, currentSeconds);
    }
    return { deepWorkSeconds, maxSessionSeconds };
}
function buildSessions(items) {
    if (!items || items.length === 0) {
        return [];
    }
    const ordered = [...items].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const sessions = [];
    let current = null;
    let lastTs = null;
    for (const item of ordered) {
        const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
        if (Number.isNaN(ts)) {
            continue;
        }
        const idle = isIdleItem(item);
        const gapSeconds = lastTs ? Math.max(0, (ts - lastTs) / 1000) : 0;
        if (!current || idle || gapSeconds > SESSION_GAP_SECONDS) {
            if (current) {
                sessions.push(current);
            }
            current = {
                start: item.timestamp,
                end: item.timestamp,
                apps: new Set(),
                totalSeconds: 0,
                productiveSeconds: 0,
                switches: 0,
                lastApp: null,
            };
        }
        if (!idle && current) {
            const app = cleanAppName(item.active_window || "Unknown");
            current.apps.add(app);
            if (current.lastApp && current.lastApp !== app) {
                current.switches += 1;
            }
            current.lastApp = app;
            current.totalSeconds += POLL_SECONDS;
            if (getCategory(item.active_window || "") === "productive") {
                current.productiveSeconds += POLL_SECONDS;
            }
        }
        if (current) {
            current.end = item.timestamp;
        }
        lastTs = ts;
    }
    if (current) {
        sessions.push(current);
    }
    return sessions.map((session) => ({
        start: session.start,
        end: session.end,
        durationSeconds: session.totalSeconds,
        apps: Array.from(session.apps),
        productivity: session.totalSeconds
            ? Math.round((session.productiveSeconds / session.totalSeconds) * 100)
            : 0,
        switches: session.switches,
    }));
}
function groupTimeline(items) {
    const groups = [];
    let current = null;
    for (const item of items) {
        const app = cleanAppName(item.active_window || "Unknown");
        if (!current || current.app !== app) {
            current = {
                app,
                start: item.timestamp,
                end: item.timestamp,
                count: 1,
            };
            groups.push(current);
        } else {
            current.end = item.timestamp;
            current.count += 1;
        }
    }
    return groups;
}
function Sparkline({ data }) {
    const points = buildSparklinePoints(data, 120, 32);
    return (
        <svg className="h-8 w-28" viewBox="0 0 120 32" aria-hidden="true">
            <polyline
                fill="none"
                stroke="#0f172a"
                strokeWidth="2"
                points={points}
            />
        </svg>
    );
}
function KpiIcon({ type }) {
    const common = "h-5 w-5 text-slate-300";
    if (type === "users") {
        return (
            <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M16 20c0-2.2-2-4-4-4s-4 1.8-4 4" />
                <circle cx="12" cy="8" r="3" />
            </svg>
        );
    }
    if (type === "bolt") {
        return (
            <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" />
            </svg>
        );
    }
    if (type === "clock") {
        return (
            <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </svg>
        );
    }
    if (type === "target") {
        return (
            <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3" />
            </svg>
        );
    }
    return null;
}
function KpiCard({ title, value, trend, trendType = "up", subtext, icon, color = "slate", data }) {
    const trendClass = trendType === "down" ? "text-rose-600" : "text-emerald-600";
    const accentMap = {
        green: "bg-emerald-500",
        blue: "bg-indigo-500",
        red: "bg-rose-500",
        gray: "bg-slate-400",
        slate: "bg-slate-300",
    };
    const accent = accentMap[color] || accentMap.slate;
    return (
        <div className="group rounded-2xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
            <div className="flex items-start gap-4">
                <div className={`h-full w-1 self-stretch rounded-full ${accent}`} />
                <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {title}
                            </div>
                            <div className="mt-2 text-3xl font-semibold text-slate-900">
                                {value}
                            </div>
                        </div>
                        <div className="text-lg text-slate-300">{icon}</div>
                    </div>
                    {trend && (
                        <div className={`mt-2 text-sm font-semibold ${trendClass}`}>
                            {trendType === "down" ? "Down" : "Up"} {trend}
                        </div>
                    )}
                    {subtext && (
                        <div className="mt-1 text-xs text-slate-500">{subtext}</div>
                    )}
                    {data && (
                        <div className="mt-3">
                            <Sparkline data={data} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
function InsightBanner({ text, tone = "neutral" }) {
    const tones = {
        positive: "bg-emerald-50 text-emerald-700",
        warning: "bg-amber-50 text-amber-700",
        negative: "bg-rose-50 text-rose-700",
        neutral: "bg-slate-100 text-slate-600",
    };
    return (
        <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${tones[tone] || tones.neutral}`}>
            {text}
        </div>
    );
}
function AnalyticsCharts({ productivitySeries, appBars }) {
    return (
        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-4 text-sm font-semibold text-slate-700">Productivity Over Time</div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={productivitySeries}>
                            <defs>
                                <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Area type="monotone" dataKey="value" stroke="#4f46e5" fill="url(#prodFill)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-4 text-sm font-semibold text-slate-700">Time Spent by App</div>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={appBars}>
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(value) => `${value} min`} />
                            <Bar dataKey="time" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
function AppDistribution({ categories, topAppLabel }) {
    const total = categories.productive + categories.neutral + categories.unproductive || 1;
    const segments = [
        { label: "Productive", value: categories.productive, color: "#22c55e" },
        { label: "Neutral", value: categories.neutral, color: "#f59e0b" },
        { label: "Unproductive", value: categories.unproductive, color: "#ef4444" },
    ];
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-semibold text-slate-700">App Distribution</div>
            <div className="flex flex-wrap items-center gap-6">
                <div className="relative h-40 w-40">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={segments}
                                dataKey="value"
                                nameKey="label"
                                outerRadius={70}
                                innerRadius={45}
                                paddingAngle={2}
                            >
                                {segments.map((entry) => (
                                    <Cell key={entry.label} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${Math.round((value / total) * 100)}%`} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <div className="text-xs font-semibold uppercase text-slate-400">App Usage</div>
                        <div className="text-sm font-semibold text-slate-700">{topAppLabel}</div>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    {segments.map((segment) => (
                        <div key={segment.label} className="flex items-center gap-2 text-slate-600">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
                            <span className="w-24">{segment.label}</span>
                            <span className="text-slate-500">{Math.round((segment.value / total) * 100)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
function Heatmap({ data }) {
    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 text-sm font-semibold text-slate-700">Activity Heatmap</div>
            <div className="grid gap-2">
                <div className="grid grid-cols-[80px,1fr] gap-2 text-xs text-slate-500">
                    <div />
                    <div className="grid grid-cols-12 gap-1">
                        {data.hours.map((hour) => (
                            <span key={hour} className="text-center">{hour}</span>
                        ))}
                    </div>
                </div>
                {data.users.map((user) => (
                    <div key={user} className="grid grid-cols-[80px,1fr] gap-2">
                        <div className="truncate text-xs text-slate-500">{user}</div>
                        <div className="grid grid-cols-12 gap-1">
                            {data.hours.map((hour) => {
                                const value = data.matrix[user]?.[hour] || 0;
                                const intensity = Math.min(1, value / data.max || 1);
                                const shade = `rgba(79, 70, 229, ${0.1 + intensity * 0.6})`;
                                return (
                                    <div key={`${user}-${hour}`} className="h-4 rounded-sm" style={{ backgroundColor: shade }} />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
function SummaryBar({ stats, sparklines }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
                title="Total Users"
                value={stats.totalUsers}
                trend={null}
                icon={<KpiIcon type="users" />}
                color="gray"
                data={sparklines?.users}
            />
            <KpiCard
                title="Average Productivity"
                value={`${stats.avgProductivity}%`}
                trend={null}
                icon={<KpiIcon type="bolt" />}
                color="green"
                data={sparklines?.productivity}
            />
            <KpiCard
                title="Total Active Time"
                value={formatDuration(stats.totalActiveSeconds)}
                trend={stats.deltaTotalLabel}
                trendType={stats.deltaTotalSeconds >= 0 ? "up" : "down"}
                subtext="vs yesterday"
                icon={<KpiIcon type="clock" />}
                color="blue"
                data={sparklines?.active}
            />
            <KpiCard
                title="Productive Time"
                value={formatDuration(stats.totalProductiveSeconds)}
                trend={stats.deltaProductiveLabel}
                trendType={stats.deltaProductiveSeconds >= 0 ? "up" : "down"}
                subtext="vs yesterday"
                icon={<KpiIcon type="bolt" />}
                color="green"
                data={sparklines?.productive}
            />
        </div>
    );
}
function TeamInsights({ insights }) {
    if (!insights) {
        return null;
    }
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
                title="Most Productive"
                value={insights.mostProductive?.name || "-"}
                trend={insights.mostProductive?.meta || null}
                trendType="up"
                icon={<KpiIcon type="bolt" />}
                color="green"
                data={null}
            />
            <KpiCard
                title="Least Productive"
                value={insights.leastProductive?.name || "-"}
                trend={insights.leastProductive?.meta || null}
                trendType="down"
                icon={<KpiIcon type="bolt" />}
                color="red"
                data={null}
            />
            <KpiCard
                title="Top Focus Session"
                value={insights.topFocusSession?.name || "-"}
                trend={insights.topFocusSession?.meta || null}
                trendType="up"
                icon={<KpiIcon type="target" />}
                color="blue"
                data={null}
            />
            <KpiCard
                title="Highest Idle"
                value={insights.highestIdle?.name || "-"}
                trend={insights.highestIdle?.meta || null}
                trendType="down"
                icon={<KpiIcon type="clock" />}
                color="red"
                data={null}
            />
        </div>
    );
}
function Badge({ tone, children }) {
    const tones = {
        high: "bg-emerald-100 text-emerald-700",
        medium: "bg-amber-100 text-amber-700",
        low: "bg-rose-100 text-rose-700",
        neutral: "bg-slate-100 text-slate-600",
        alert: "bg-rose-100 text-rose-700",
    };
    return (
        <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}
        >
            {children}
        </span>
    );
}
function Card({ children, className = "" }) {
    return (
        <div
            className={`rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}
        >
            {children}
        </div>
    );
}
function MetricPill({ colorClass, label }) {
    return (
        <span className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">
            <span className={`h-2 w-2 rounded-full ${colorClass}`} />
            <span>{label}</span>
        </span>
    );
}
function AppIcon({ app }) {
    const category = getCategory(app);
    const color =
        category === "productive"
            ? "bg-emerald-100 text-emerald-700"
            : category === "unproductive"
            ? "bg-rose-100 text-rose-700"
            : "bg-amber-100 text-amber-700";
    const letter = app ? app[0].toUpperCase() : "A";
    return (
        <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${color}`}
        >
            {letter}
        </div>
    );
}
function SegmentedBar({ productive, neutral, unproductive }) {
    return (
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="bg-emerald-500" style={{ width: `${productive}%` }} />
            <div className="bg-amber-400" style={{ width: `${neutral}%` }} />
            <div className="bg-rose-500" style={{ width: `${unproductive}%` }} />
        </div>
    );
}
function AppUsage({ apps }) {
    const total = apps.reduce((sum, app) => sum + app.seconds, 0) || 1;
    return (
        <div className="space-y-3">
            {apps.map((app) => {
                const percent = Math.round((app.seconds / total) * 100);
                return (
                    <div key={app.name} className="space-y-2">
                        <div className="flex items-center justify-between text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                                <AppIcon app={app.name} />
                                <span className="font-medium text-slate-700">
                                    {app.name}
                                </span>
                            </div>
                            <span>{percent}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100">
                            <div
                                className="h-2 rounded-full bg-slate-900"
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
function Timeline({ items }) {
    const groups = groupTimeline(items);
    return (
        <div className="max-h-40 space-y-3 overflow-y-auto pr-2">
            {groups.map((group) => (
                <div key={`${group.app}-${group.start}`} className="flex items-start gap-3">
                    <AppIcon app={group.app} />
                    <div>
                        <div className="text-sm font-medium text-slate-700">
                            {group.app}
                        </div>
                        <div className="text-xs text-slate-500">
                            {formatTime(group.start)} to {formatTime(group.end)}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
function UserCard({ user, comparison, collapsed, onToggle }) {
    const productivityLevel = user.productivityScore >= 80 ? "high" : user.productivityScore >= 50 ? "medium" : "low";
    const statusLabel = productivityLevel === "high" ? "High Performer" : productivityLevel === "medium" ? "Average" : "Needs Attention";
    const [isRenaming, setIsRenaming] = useState(false);
    const [aliasName, setAliasName] = useState(user.alias_name || "");
    const [aliasDraft, setAliasDraft] = useState(user.alias_name || "");
    useEffect(() => {
        setAliasName(user.alias_name || "");
        setAliasDraft(user.alias_name || "");
    }, [user.alias_name]);
    const displayPrimary = aliasName || user.hostname || "Unknown device";
    const displaySecondary = user.hostname || "Unknown";
    const [tab, setTab] = useState("apps");
    const topApps = user.appUsage.slice(0, 3);
    const remainingApps = Math.max(0, user.appUsage.length - topApps.length);
    const totalAppSeconds = user.appUsage.reduce((sum, app) => sum + app.seconds, 0) || 1;
    const lastSession = user.sessions[0];
    const productivityTitle = `Productive ${user.categoryPercent.productive}% | Neutral ${user.categoryPercent.neutral}% | Unproductive ${user.categoryPercent.unproductive}%`;
    const saveAlias = async () => {
        const trimmed = aliasDraft.trim();
        try {
            await axios.put(`${API_BASE}/device-aliases/${encodeURIComponent(user.hostname || "Unknown")}`, {
                alias_name: trimmed,
            });
            setAliasName(trimmed);
            setIsRenaming(false);
        } catch (err) {
            console.error("[dashboard] alias update failed:", err);
        }
    };
    const cancelRename = () => {
        setAliasDraft(aliasName);
        setIsRenaming(false);
    };
    return (
        <Card>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-sm font-semibold text-slate-900">
                        {displayPrimary}
                    </div>
                    {!isRenaming && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                            <span>{displaySecondary}</span>
                            <button
                                type="button"
                                onClick={() => setIsRenaming(true)}
                                className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Rename
                            </button>
                        </div>
                    )}
                    {isRenaming && (
                        <div className="mt-2 flex items-center gap-2">
                            <input
                                type="text"
                                value={aliasDraft}
                                onChange={(event) => setAliasDraft(event.target.value)}
                                placeholder="Device name"
                                className="w-48 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={saveAlias}
                                className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                onClick={cancelRename}
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Badge tone={productivityLevel}>{statusLabel}</Badge>
                </div>
            </div>

            <div className="mt-5 flex items-end justify-between">
                <div>
                    <div className="text-4xl font-semibold text-slate-900">
                        {user.productivityScore}
                    </div>
                    <div className="text-xs text-slate-500">{user.productivityLabel}</div>
                </div>
                <div className="text-xs text-slate-500">Focus {user.focusScore}%</div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <MetricPill colorClass="bg-emerald-500" label={`Active ${formatDuration(user.activeSeconds)}`} />
                <MetricPill colorClass="bg-slate-400" label={`Idle ${formatDuration(user.idleSeconds)}`} />
                <MetricPill colorClass="bg-emerald-600" label={`Deep ${formatDuration(user.deepWorkSeconds)}`} />
                <MetricPill colorClass="bg-slate-600" label={`Switches ${user.switchCount}`} />
            </div>

            <div className="mt-5 grid gap-4">
                <div>
                    <div className="text-xs font-semibold uppercase text-slate-400">Top Apps</div>
                    <div className="mt-2 space-y-1 text-sm text-slate-600">
                        {topApps.length === 0 ? (
                            <div className="text-slate-400">No app data yet.</div>
                        ) : (
                            topApps.map((app) => (
                                <div key={app.name} className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{app.name}</span>
                                    <span className="text-slate-500">
                                        {Math.round((app.seconds / totalAppSeconds) * 100)}%
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                    {remainingApps > 0 && (
                        <div className="mt-1 text-xs text-slate-400">+{remainingApps} more</div>
                    )}
                </div>

                <div>
                    <div className="text-xs font-semibold uppercase text-slate-400">Last Session</div>
                    {lastSession ? (
                        <div className="mt-2 text-sm text-slate-600">
                            <div>
                                {formatDuration(lastSession.durationSeconds)}
                            </div>
                            <div className="text-xs text-slate-500">
                                {lastSession.apps.slice(0, 3).join(", ") || "-"}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 text-xs text-slate-400">No sessions detected.</div>
                    )}
                </div>
            </div>

            <div className="mt-5" title={productivityTitle}>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-2 bg-emerald-500" style={{ width: `${user.categoryPercent.productive}%` }} />
                    <div className="h-2 bg-amber-400" style={{ width: `${user.categoryPercent.neutral}%` }} />
                    <div className="h-2 bg-rose-500" style={{ width: `${user.categoryPercent.unproductive}%` }} />
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                {user.alerts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {user.alerts.map((alert) => (
                            <Badge key={alert} tone="alert">{alert}</Badge>
                        ))}
                    </div>
                ) : (
                    <span className="text-xs text-slate-400">No alerts</span>
                )}
                <button
                    type="button"
                    onClick={onToggle}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                    {collapsed ? "View Details" : "Hide Details"}
                </button>
            </div>

            {!collapsed && (
                <div className="mt-5 space-y-4 transition-all duration-200">
                    <div className="text-xs text-slate-500">
                        Focus {user.scoreBreakdown.focus}% / App Quality {user.scoreBreakdown.appQuality}% / Consistency {user.scoreBreakdown.consistency}% / Idle {user.scoreBreakdown.idle}%
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setTab("apps")}
                            className={`rounded-full px-3 py-1 ${tab === "apps" ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                        >
                            Apps
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab("timeline")}
                            className={`rounded-full px-3 py-1 ${tab === "timeline" ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                        >
                            Timeline
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab("sessions")}
                            className={`rounded-full px-3 py-1 ${tab === "sessions" ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                        >
                            Sessions
                        </button>
                    </div>
                    {tab === "apps" && <AppUsage apps={user.appUsage} />}
                    {tab === "timeline" && <Timeline items={user.timeline} />}
                    {tab === "sessions" && (
                        <div className="space-y-2 text-sm text-slate-600">
                            {user.sessions.length === 0 ? (
                                <div className="text-slate-400">No sessions detected.</div>
                            ) : (
                                user.sessions.map((session) => (
                                    <div key={`${session.start}-${session.end}`} className="rounded-lg bg-slate-50 p-3">
                                        <div className="text-xs text-slate-500">
                                            {formatTime(session.start)} - {formatTime(session.end)} / {formatDuration(session.durationSeconds)}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Apps: {session.apps.slice(0, 4).join(", ") || "-"}
                                        </div>
                                        <div className="text-xs text-slate-500">Productivity {session.productivity}% / Switches {session.switches}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}
function LiveSection({ data }) {
    return (
        <div className="rounded-2xl bg-white p-6 shadow-card">
            <div className="mb-4 text-sm font-semibold text-slate-700">Live Activity</div>
            <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                        <tr>
                            <th className="px-4 py-3 text-left">User</th>
                            <th className="px-4 py-3 text-left">Host</th>
                            <th className="px-4 py-3 text-left">Active Window</th>
                            <th className="px-4 py-3 text-left">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.length === 0 ? (
                            <tr>
                                <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                                    No activity yet.
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => (
                                <tr key={`${item.username}-${item.hostname}-${item.timestamp}`}>
                                    <td className="px-4 py-3 text-slate-700">{item.username}</td>
                                    <td className="px-4 py-3 text-slate-700">{item.alias_name ? `${item.alias_name} (${item.hostname})` : item.hostname}</td>
                                    <td className="px-4 py-3 text-slate-700">{item.active_window}</td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {new Date(item.timestamp).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
export default function Dashboard() {
    const [activities, setActivities] = useState([]);
    const [error, setError] = useState("");
    const [selectedHost, setSelectedHost] = useState("All");
    const [searchText, setSearchText] = useState("");
    const [timeRange, setTimeRange] = useState("15m");
    const [activeTab, setActiveTab] = useState("daily");
    const [selectedDate, setSelectedDate] = useState(() =>
        new Date().toISOString().slice(0, 10)
    );
    const [collapsedDaily, setCollapsedDaily] = useState({});
    const [dailySearch, setDailySearch] = useState("");
    const [dailySort, setDailySort] = useState("productivity");
    const [summaryRange, setSummaryRange] = useState("day");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("All");
    const [roleFilter, setRoleFilter] = useState("All");
    const [locationFilter, setLocationFilter] = useState("All");
    const [adminRange, setAdminRange] = useState("7d");
    const [adminStart, setAdminStart] = useState(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
        return start.toISOString().slice(0, 10);
    });
    const [adminEnd, setAdminEnd] = useState(() => new Date().toISOString().slice(0, 10));
    useEffect(() => {
        let isMounted = true;
        const fetchActivities = async () => {
            try {
                const response = await axios.get(API_URL, { timeout: 5000 });
                if (isMounted) {
                    setActivities(response.data || []);
                    setError("");
                }
            } catch (err) {
                if (isMounted) {
                    setError("Failed to load activity data.");
                }
                console.error("[dashboard] fetch error:", err);
            }
        };
        fetchActivities();
        const intervalId = setInterval(fetchActivities, POLL_MS);
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []);
    const departmentOptions = useMemo(() => {
        const values = new Set();
        for (const item of activities) {
            if (item.department) {
                values.add(item.department);
            }
        }
        return ["All", ...Array.from(values).sort()];
    }, [activities]);

    const roleOptions = useMemo(() => {
        const values = new Set();
        for (const item of activities) {
            if (item.role) {
                values.add(item.role);
            }
        }
        return ["All", ...Array.from(values).sort()];
    }, [activities]);

    const locationOptions = useMemo(() => {
        const values = new Set();
        for (const item of activities) {
            if (item.location) {
                values.add(item.location);
            }
        }
        return ["All", ...Array.from(values).sort()];
    }, [activities]);

    const hostOptions = useMemo(() => {
        const hosts = new Set();
        for (const item of activities) {
            hosts.add(item.hostname || "Unknown");
        }
        return ["All", ...Array.from(hosts).sort()];
    }, [activities]);
    const timeFilteredActivities = useMemo(() => {
        if (timeRange === "all") {
            return activities;
        }
        const now = Date.now();
        const minutes =
            timeRange === "5m"
                ? 5
                : timeRange === "15m"
                ? 15
                : timeRange === "60m"
                ? 60
                : 24 * 60;
        const cutoff = now - minutes * 60 * 1000;
        return activities.filter((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
            return !Number.isNaN(ts) && ts >= cutoff;
        });
    }, [activities, timeRange]);
    const filteredActivities = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        return timeFilteredActivities.filter((item) => {
            const hostname = item.hostname || "Unknown";
            if (selectedHost !== "All" && hostname !== selectedHost) {
                return false;
            }
            if (departmentFilter !== "All" && item.department !== departmentFilter) {
                return false;
            }
            if (roleFilter !== "All" && item.role !== roleFilter) {
                return false;
            }
            if (locationFilter !== "All" && item.location !== locationFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            const windowText = (item.active_window || "").toLowerCase();
            return windowText.includes(query);
        });
    }, [timeFilteredActivities, searchText, selectedHost, departmentFilter, roleFilter, locationFilter]);
    const dailyActivities = useMemo(() => {
        const baseDate = selectedDate || new Date().toISOString().slice(0, 10);
        const day = new Date(baseDate + "T00:00:00");
        let start = day.getTime();
        let end = start + 24 * 60 * 60 * 1000;

        if (summaryRange === "week") {
            start = end - 7 * 24 * 60 * 60 * 1000;
        }

        if (summaryRange === "custom" && customStart && customEnd) {
            start = new Date(customStart + "T00:00:00").getTime();
            end = new Date(customEnd + "T23:59:59").getTime();
        }

        return activities.filter((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
            if (Number.isNaN(ts) || ts < start || ts > end) {
                return false;
            }
            if (departmentFilter !== "All" && item.department !== departmentFilter) {
                return false;
            }
            if (roleFilter !== "All" && item.role !== roleFilter) {
                return false;
            }
            if (locationFilter !== "All" && item.location !== locationFilter) {
                return false;
            }
            return true;
        });
    }, [activities, selectedDate, summaryRange, customStart, customEnd, departmentFilter, roleFilter, locationFilter]);
    const dailySummary = useMemo(() => {
        const grouped = new Map();
        for (const item of dailyActivities) {
            const hostname = item.hostname || "Unknown";
            if (!grouped.has(hostname)) {
                grouped.set(hostname, []);
            }
            grouped.get(hostname).push(item);
        }
        return Array.from(grouped.entries()).map(([hostname, items]) => {
            const latest = items[0];
            const username = latest?.username || "Unknown";
            const alias_name = latest?.alias_name || "";
            const totalSeconds = items.length * POLL_SECONDS;
            const firstTime = items[0]?.timestamp ? new Date(items[0].timestamp).getTime() : Number.NaN;
            const lastTime = items[items.length - 1]?.timestamp ? new Date(items[items.length - 1].timestamp).getTime() : Number.NaN;
            let sessionSeconds = totalSeconds;
            if (!Number.isNaN(firstTime) && !Number.isNaN(lastTime)) {
                sessionSeconds = Math.max(0, (firstTime - lastTime) / 1000);
            }
            const appCounts = new Map();
            for (const item of items) {
                const app = cleanAppName(item.active_window || "Unknown");
                appCounts.set(app, (appCounts.get(app) || 0) + 1);
            }
            const appUsage = Array.from(appCounts.entries())
                .map(([name, count]) => ({
                    name,
                    count,
                    seconds: count * POLL_SECONDS,
                }))
                .sort((a, b) => b.count - a.count);
            const topAppEntry = appUsage[0];
            const categoryTime = {
                productive: 0,
                neutral: 0,
                unproductive: 0,
            };
            for (const item of items) {
                const category = getCategory(item.active_window || "");
                categoryTime[category] += POLL_SECONDS;
            }
            const categoryTotal = categoryTime.productive + categoryTime.neutral + categoryTime.unproductive;
            const categoryPercent = {
                productive: categoryTotal
                    ? Math.round((categoryTime.productive / categoryTotal) * 100)
                    : 0,
                neutral: categoryTotal
                    ? Math.round((categoryTime.neutral / categoryTotal) * 100)
                    : 0,
                unproductive: categoryTotal
                    ? Math.round((categoryTime.unproductive / categoryTotal) * 100)
                    : 0,
            };
            const activeSeconds = items.length * POLL_SECONDS;
            const idleSeconds = Math.max(0, sessionSeconds - activeSeconds);
            const timeline = items.slice(0, 10);
            const productiveSeconds = appUsage.reduce((sum, app) => (
                PRODUCTIVE_APPS.has(app.name) ? sum + app.seconds : sum
            ), 0);
            const productivity = totalSeconds
                ? Math.round((productiveSeconds / totalSeconds) * 100)
                : 0;
            const workStart = items[items.length - 1]?.timestamp || null;
            const workEnd = items[0]?.timestamp || null;
            const totalSpanSeconds = sessionSeconds;
            const idleAlert = idleSeconds >= IDLE_ALERT_SECONDS;
            let switchCount = 0;
            for (let i = 1; i < items.length; i += 1) {
                const prev = cleanAppName(items[i - 1]?.active_window || "Unknown");
                const next = cleanAppName(items[i]?.active_window || "Unknown");
                if (prev !== next) {
                    switchCount += 1;
                }
            }
            const switchRate = items.length > 1 ? switchCount / (items.length - 1) : 0;
            const focusScore = Math.max(0, Math.min(100, Math.round(100 - switchRate * 100)));
            const { deepWorkSeconds, maxSessionSeconds } = computeDeepWork(items);
            let idleInterruptions = 0;
            let lastIdle = false;
            for (const item of items) {
                const idle = isIdleItem(item);
                if (idle && !lastIdle) {
                    idleInterruptions += 1;
                }
                lastIdle = idle;
            }
            const sessions = buildSessions(items);
            const consistencyScore = clamp(100 - Math.max(0, sessions.length - 1) * 12, 30, 100);
            const appQualityScore = categoryTotal
                ? Math.round((categoryTime.productive / categoryTotal) * 100)
                : 0;
            const idleScore = totalSeconds
                ? Math.round(100 - (idleSeconds / totalSeconds) * 100)
                : 100;
            const scoreBreakdown = {
                focus: Math.round(focusScore),
                appQuality: appQualityScore,
                consistency: consistencyScore,
                idle: clamp(idleScore, 0, 100),
            };
            const productivityScore = Math.round(
                scoreBreakdown.focus * SCORE_WEIGHTS.focus +
                scoreBreakdown.appQuality * SCORE_WEIGHTS.appQuality +
                scoreBreakdown.consistency * SCORE_WEIGHTS.consistency +
                scoreBreakdown.idle * SCORE_WEIGHTS.idle
            );
            const productivityLabel = productivityScore >= 80
                ? "Excellent"
                : productivityScore >= 60
                ? "Good"
                : productivityScore >= 40
                ? "Fair"
                : "Low";
            const alerts = [];
            if (idleSeconds >= 2 * 3600) {
                alerts.push("Idle > 2h");
            }
            if (productivityScore < 20) {
                alerts.push("Productivity < 20");
            }
            const whatsappUsage = appUsage.find((app) => app.name.toLowerCase().includes("whatsapp"));
            if (whatsappUsage && totalSeconds && whatsappUsage.seconds / totalSeconds > 0.2) {
                alerts.push("Excess WhatsApp");
            }
            return {
                hostname,
                username,
                alias_name,
                totalSeconds,
                sessionSeconds,
                activeSeconds,
                idleSeconds,
                productiveSeconds,
                productivity,
                productivityScore,
                productivityLabel,
                scoreBreakdown,
                workStart,
                workEnd,
                totalSpanSeconds,
                idleAlert,
                focusScore,
                switchCount,
                idleInterruptions,
                deepWorkSeconds,
                maxSessionSeconds,
                categoryPercent,
                topApp: topAppEntry ? topAppEntry.name : "-",
                appUsage,
                timeline,
                alerts,
                sessions,
            };
        });
    }, [dailyActivities]);
    const weeklySeries = useMemo(() => {
        const baseDate = selectedDate || new Date().toISOString().slice(0, 10);
        const endDay = new Date(baseDate + "T00:00:00");
        const series = [];
        for (let i = 6; i >= 0; i -= 1) {
            const dayStart = new Date(endDay);
            dayStart.setDate(endDay.getDate() - i);
            const start = dayStart.getTime();
            const end = start + 24 * 60 * 60 * 1000;
            const dayItems = activities.filter((item) => {
                const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
                return !Number.isNaN(ts) && ts >= start && ts < end;
            });
            const totalSeconds = dayItems.length * POLL_SECONDS;
            const productiveSeconds = dayItems.filter((item) => getCategory(item.active_window || "") === "productive").length * POLL_SECONDS;
            const avgProductivity = totalSeconds ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;
            series.push({
                label: dayStart.toLocaleDateString(undefined, { weekday: "short" }),
                totalSeconds,
                productiveSeconds,
                avgProductivity,
            });
        }
        return series;
    }, [activities, selectedDate]);
    const sparklines = useMemo(() => ({
        users: weeklySeries.map((day) => (day.totalSeconds ? 1 : 0)),
        active: weeklySeries.map((day) => day.totalSeconds),
        productive: weeklySeries.map((day) => day.productiveSeconds),
        productivity: weeklySeries.map((day) => day.avgProductivity),
    }), [weeklySeries]);
    const dailyComparison = useMemo(() => {
        if (!selectedDate) {
            return {
                todayTotal: 0,
                yesterdayTotal: 0,
                todayProductive: 0,
                yesterdayProductive: 0,
                byHost: new Map(),
            };
        }
        const day = new Date(selectedDate + "T00:00:00");
        const dayStart = day.getTime();
        const yStart = dayStart - 24 * 60 * 60 * 1000;
        const yEnd = dayStart;
        const yesterdayActivities = activities.filter((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
            return !Number.isNaN(ts) && ts >= yStart && ts < yEnd;
        });
        const summarize = (items) => {
            const map = new Map();
            for (const item of items) {
                const hostname = item.hostname || "Unknown";
                const category = getCategory(item.active_window || "");
                if (!map.has(hostname)) {
                    map.set(hostname, { totalSeconds: 0, productiveSeconds: 0 });
                }
                const entry = map.get(hostname);
                entry.totalSeconds += POLL_SECONDS;
                if (category === "productive") {
                    entry.productiveSeconds += POLL_SECONDS;
                }
            }
            return map;
        };
        const todayMap = summarize(dailyActivities);
        const yesterdayMap = summarize(yesterdayActivities);
        let todayTotal = 0;
        let yesterdayTotal = 0;
        let todayProductive = 0;
        let yesterdayProductive = 0;
        for (const entry of todayMap.values()) {
            todayTotal += entry.totalSeconds;
            todayProductive += entry.productiveSeconds;
        }
        for (const entry of yesterdayMap.values()) {
            yesterdayTotal += entry.totalSeconds;
            yesterdayProductive += entry.productiveSeconds;
        }
        const byHost = new Map();
        const hosts = new Set([...todayMap.keys(), ...yesterdayMap.keys()]);
        for (const hostname of hosts) {
            byHost.set(hostname, {
                today: todayMap.get(hostname) || { totalSeconds: 0, productiveSeconds: 0 },
                yesterday: yesterdayMap.get(hostname) || { totalSeconds: 0, productiveSeconds: 0 },
            });
        }
        return {
            todayTotal,
            yesterdayTotal,
            todayProductive,
            yesterdayProductive,
            byHost,
        };
    }, [activities, dailyActivities, selectedDate]);
    const dailySummaryFiltered = useMemo(() => {
        const query = dailySearch.trim().toLowerCase();
        let list = dailySummary;
        if (query) {
            list = list.filter((user) => {
                const target = `${user.username} ${user.hostname} ${user.alias_name || ""}`.toLowerCase();
                return target.includes(query);
            });
        }
        const sorted = [...list].sort((a, b) => {
            if (dailySort === "idle") {
                return b.idleSeconds - a.idleSeconds;
            }
            if (dailySort === "productivity") {
                return b.productivityScore - a.productivityScore;
            }
            if (dailySort === "total") {
                return b.totalSeconds - a.totalSeconds;
            }
            return b.activeSeconds - a.activeSeconds;
        });
        return sorted;
    }, [dailySummary, dailySearch, dailySort]);
    const teamInsights = useMemo(() => {
        if (dailySummaryFiltered.length === 0) {
            return null;
        }
        const mostProductive = [...dailySummaryFiltered].sort((a, b) => b.productivityScore - a.productivityScore)[0];
        const leastProductive = [...dailySummaryFiltered].sort((a, b) => a.productivityScore - b.productivityScore)[0];
        const topFocus = [...dailySummaryFiltered].sort((a, b) => b.maxSessionSeconds - a.maxSessionSeconds)[0];
        const highestIdle = [...dailySummaryFiltered].sort((a, b) => b.idleSeconds - a.idleSeconds)[0];
        const displayName = (entry) => (
            entry?.alias_name || entry?.username || entry?.hostname || "Unknown"
        );
        return {
            mostProductive: mostProductive ? {
                name: displayName(mostProductive),
                meta: `Score ${mostProductive.productivityScore}`,
            } : null,
            leastProductive: leastProductive ? {
                name: displayName(leastProductive),
                meta: `Score ${leastProductive.productivityScore}`,
            } : null,
            topFocusSession: topFocus ? {
                name: displayName(topFocus),
                meta: formatDuration(topFocus.maxSessionSeconds),
            } : null,
            highestIdle: highestIdle ? {
                name: displayName(highestIdle),
                meta: formatDuration(highestIdle.idleSeconds),
            } : null,
        };
    }, [dailySummaryFiltered]);
        const adminRangeBounds = useMemo(() => {
        const now = new Date();
        let start;
        let end = now;
        if (adminRange === "today") {
            start = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
        } else if (adminRange === "7d") {
            start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
        } else if (adminRange === "30d") {
            start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
        } else if (adminRange === "custom" && adminStart && adminEnd) {
            start = new Date(adminStart + "T00:00:00");
            end = new Date(adminEnd + "T23:59:59");
        } else {
            start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
        }
        return { start, end };
    }, [adminRange, adminStart, adminEnd]);

    const adminActivities = useMemo(() => {
        const { start, end } = adminRangeBounds;
        const startTs = start.getTime();
        const endTs = end.getTime();
        return activities.filter((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
            if (Number.isNaN(ts) || ts < startTs || ts > endTs) {
                return false;
            }
            if (departmentFilter !== "All" && item.department !== departmentFilter) {
                return false;
            }
            if (roleFilter !== "All" && item.role !== roleFilter) {
                return false;
            }
            if (locationFilter !== "All" && item.location !== locationFilter) {
                return false;
            }
            return true;
        });
    }, [activities, adminRangeBounds, departmentFilter, roleFilter, locationFilter]);

    const adminAnalytics = useMemo(() => {
        const uniqueHosts = new Set();
        const appSeconds = new Map();
        const categorySeconds = { productive: 0, neutral: 0, unproductive: 0 };
        let idleSeconds = 0;
        for (const item of adminActivities) {
            const hostname = item.hostname || "Unknown";
            uniqueHosts.add(hostname);
            const app = item.active_window || "Unknown";
            appSeconds.set(app, (appSeconds.get(app) || 0) + POLL_SECONDS);
            const category = getCategory(app);
            categorySeconds[category] += POLL_SECONDS;
            if (isIdleItem(item)) {
                idleSeconds += POLL_SECONDS;
            }
        }
        const totalSeconds = adminActivities.length * POLL_SECONDS;
        const productiveSeconds = categorySeconds.productive;
        const productivityPercent = totalSeconds ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;
        const topAppsByTime = Array.from(appSeconds.entries())
            .map(([name, seconds]) => ({ name, seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 6);
        const topApp = topAppsByTime[0];

        const rangeMs = adminRangeBounds.end.getTime() - adminRangeBounds.start.getTime();
        const prevStart = new Date(adminRangeBounds.start.getTime() - rangeMs);
        const prevEnd = new Date(adminRangeBounds.start.getTime());
        const prevItems = activities.filter((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
            return !Number.isNaN(ts) && ts >= prevStart.getTime() && ts <= prevEnd.getTime();
        });
        let prevProductive = 0;
        for (const item of prevItems) {
            const category = getCategory(item.active_window || "");
            if (category === "productive") {
                prevProductive += POLL_SECONDS;
            }
        }
        const prevTotal = prevItems.length * POLL_SECONDS;
        const prevProductivity = prevTotal ? Math.round((prevProductive / prevTotal) * 100) : 0;
        const productivityDelta = productivityPercent - prevProductivity;

        return {
            activeUsers: uniqueHosts.size,
            devices: uniqueHosts.size,
            totalSeconds,
            productiveSeconds,
            productivityPercent,
            topApp,
            topAppsByTime,
            categorySeconds,
            idleSeconds,
            productivityDelta,
        };
    }, [adminActivities, adminRangeBounds, activities]);

    const adminSeries = useMemo(() => {
        const { start, end } = adminRangeBounds;
        const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        const buckets = [];
        if (rangeDays <= 2) {
            for (let h = 0; h < 24; h += 2) {
                buckets.push({ label: `${h}:00`, items: [] });
            }
            for (const item of adminActivities) {
                const ts = item.timestamp ? new Date(item.timestamp) : null;
                if (!ts) continue;
                const hour = ts.getHours();
                const bucketIndex = Math.min(buckets.length - 1, Math.floor(hour / 2));
                buckets[bucketIndex].items.push(item);
            }
        } else {
            for (let i = 0; i < rangeDays; i += 1) {
                const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
                buckets.push({ label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }), items: [] });
            }
            for (const item of adminActivities) {
                const ts = item.timestamp ? new Date(item.timestamp) : null;
                if (!ts) continue;
                const dayIndex = Math.floor((ts.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
                if (dayIndex >= 0 && dayIndex < buckets.length) {
                    buckets[dayIndex].items.push(item);
                }
            }
        }
        return buckets.map((bucket) => {
            const total = bucket.items.length * POLL_SECONDS;
            const productive = bucket.items.filter((item) => getCategory(item.active_window || "") === "productive").length * POLL_SECONDS;
            const value = total ? Math.round((productive / total) * 100) : 0;
            return { label: bucket.label, value };
        });
    }, [adminActivities, adminRangeBounds]);

    const heatmapData = useMemo(() => {
        const hourBuckets = Array.from({ length: 12 }, (_, idx) => idx * 2);
        const counts = new Map();
        const userTotals = new Map();
        for (const item of adminActivities) {
            const user = item.alias_name || item.username || item.hostname || "Unknown";
            const ts = item.timestamp ? new Date(item.timestamp) : null;
            if (!ts) continue;
            const hour = ts.getHours();
            const bucket = Math.floor(hour / 2) * 2;
            if (!counts.has(user)) {
                counts.set(user, {});
            }
            const map = counts.get(user);
            map[bucket] = (map[bucket] || 0) + 1;
            userTotals.set(user, (userTotals.get(user) || 0) + 1);
        }
        const topUsers = Array.from(userTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([user]) => user);
        let max = 1;
        const matrix = {};
        for (const user of topUsers) {
            const map = counts.get(user) || {};
            matrix[user] = map;
            for (const hour of hourBuckets) {
                if ((map[hour] || 0) > max) {
                    max = map[hour];
                }
            }
        }
        return { users: topUsers, hours: hourBuckets, matrix, max };
    }, [adminActivities]);

const dailyStats = useMemo(() => {
        const totalUsers = dailySummaryFiltered.length;
        const totalActiveSeconds = dailySummaryFiltered.reduce(
            (sum, user) => sum + user.activeSeconds,
            0
        );
        const totalProductiveSeconds = dailySummaryFiltered.reduce(
            (sum, user) => sum + user.productiveSeconds,
            0
        );
        const avgProductivity = totalUsers
            ? Math.round(
                dailySummaryFiltered.reduce((sum, user) => sum + user.productivityScore, 0) / totalUsers
            )
            : 0;
        const deltaTotalSeconds = dailyComparison.todayTotal - dailyComparison.yesterdayTotal;
        const deltaProductiveSeconds = dailyComparison.todayProductive - dailyComparison.yesterdayProductive;
        return {
            totalUsers,
            totalActiveSeconds,
            totalProductiveSeconds,
            avgProductivity,
            deltaTotalSeconds,
            deltaProductiveSeconds,
            deltaTotalLabel: dailyComparison.yesterdayTotal ? formatDelta(deltaTotalSeconds) : "-",
            deltaProductiveLabel: dailyComparison.yesterdayProductive ? formatDelta(deltaProductiveSeconds) : "-",
        };
    }, [dailySummaryFiltered, dailyComparison]);
    const analytics = useMemo(() => {
        const uniqueHosts = new Set();
        const latestByHost = new Map();
        const appCounts = new Map();
        const appSeconds = new Map();
        for (const item of filteredActivities) {
            const hostname = item.hostname || "Unknown";
            const app = item.active_window || "Unknown";
            uniqueHosts.add(hostname);
            if (!latestByHost.has(hostname)) {
                latestByHost.set(hostname, item);
            }
            appCounts.set(app, (appCounts.get(app) || 0) + 1);
            appSeconds.set(app, (appSeconds.get(app) || 0) + POLL_SECONDS);
        }
        const totalAppCount = filteredActivities.length || 1;
        const topAppsByCount = Array.from(appCounts.entries())
            .map(([name, count]) => ({
                name,
                count,
                percent: Math.round((count / totalAppCount) * 100),
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
        const topAppsByTime = Array.from(appSeconds.entries())
            .map(([name, seconds]) => ({ name, seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 3);
        return {
            activeUsers: uniqueHosts.size,
            currentByHost: Array.from(latestByHost.values()),
            topAppsByCount,
            topAppsByTime,
        };
    }, [filteredActivities]);
    const chartData = useMemo(() => {
        const pieData = analytics.topAppsByTime.map((app) => ({
            name: cleanAppName(app.name),
            value: Math.round(app.seconds / 60),
        }));
        const barData = analytics.topAppsByTime.map((app) => ({
            name: cleanAppName(app.name),
            time: Math.round(app.seconds / 60),
        }));
        return { pieData, barData };
    }, [analytics]);
    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Employee Monitoring</h1>
                        <p className="text-sm text-slate-500">
                            Daily Summary and Live Activity insights
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-white p-1 shadow-card">
                        <button
                            type="button"
                            onClick={() => setActiveTab("daily")}
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${
                                activeTab === "daily"
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Daily Summary
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("live")}
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${
                                activeTab === "live"
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Live Activity
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("admin")}
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${
                                activeTab === "admin"
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Analytics
                        </button>
                    </div>
                </div>
                {error && (
                    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}
                {activeTab === "daily" && (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-semibold text-slate-600">Range</label>
                                <select
                                    value={summaryRange}
                                    onChange={(event) => setSummaryRange(event.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                    <option value="day">Today</option>
                                    <option value="week">Last 7 days</option>
                                    <option value="custom">Custom</option>
                                </select>
                                {summaryRange === "custom" ? (
                                    <>
                                        <input
                                            type="date"
                                            value={customStart}
                                            onChange={(event) => setCustomStart(event.target.value)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                        />
                                        <input
                                            type="date"
                                            value={customEnd}
                                            onChange={(event) => setCustomEnd(event.target.value)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                        />
                                    </>
                                ) : (
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(event) => setSelectedDate(event.target.value)}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                    />
                                )}
                            </div>
                            <div className="text-xs text-slate-500">
                                {dailyActivities.length} events captured
                            </div>
                        </div>
                        <SummaryBar stats={dailyStats} sparklines={sparklines} />
                        <TeamInsights insights={teamInsights} />
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
                                <span className="text-xs font-semibold text-slate-500">Search</span>
                                <input
                                    type="text"
                                    placeholder="Search user..."
                                    value={dailySearch}
                                    onChange={(event) => setDailySearch(event.target.value)}
                                    className="text-sm text-slate-700 focus:outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
                                <span className="text-xs font-semibold text-slate-500">Sort</span>
                                <select
                                    value={dailySort}
                                    onChange={(event) => setDailySort(event.target.value)}
                                    className="bg-transparent text-sm text-slate-700 focus:outline-none"
                                >
                                    <option value="productivity">Productivity</option>
                                    <option value="active">Active Time</option>
                                    <option value="idle">Idle Time</option>
                                    <option value="total">Total Time</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
                                <span className="text-xs font-semibold text-slate-500">Department</span>
                                <select
                                    value={departmentFilter}
                                    onChange={(event) => setDepartmentFilter(event.target.value)}
                                    className="bg-transparent text-sm text-slate-700 focus:outline-none"
                                >
                                    {departmentOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
                                <span className="text-xs font-semibold text-slate-500">Role</span>
                                <select
                                    value={roleFilter}
                                    onChange={(event) => setRoleFilter(event.target.value)}
                                    className="bg-transparent text-sm text-slate-700 focus:outline-none"
                                >
                                    {roleOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
                                <span className="text-xs font-semibold text-slate-500">Location</span>
                                <select
                                    value={locationFilter}
                                    onChange={(event) => setLocationFilter(event.target.value)}
                                    className="bg-transparent text-sm text-slate-700 focus:outline-none"
                                >
                                    {locationOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {dailySummaryFiltered.length === 0 ? (
                            <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-card">
                                No activity for this date.
                            </div>
                        ) : (
                            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                                {dailySummaryFiltered.map((user) => (
                                    <UserCard
                                        key={user.hostname}
                                        user={user}
                                        comparison={dailyComparison.byHost.get(user.hostname)}
                                        collapsed={!!collapsedDaily[user.hostname]}
                                        onToggle={() =>
                                            setCollapsedDaily((prev) => ({
                                                ...prev,
                                                [user.hostname]: !prev[user.hostname],
                                            }))
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </div>
)}
{activeTab === "live" && (
<div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                Filter by host
                                <select
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                    value={selectedHost}
                                    onChange={(event) => setSelectedHost(event.target.value)}
                                >
                                    {hostOptions.map((host) => (
                                        <option key={host} value={host}>
                                            {host}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                Search apps
                                <input
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                    type="text"
                                    placeholder="Search apps..."
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                            </label>
                            <div className="flex items-center gap-2">
                                {[
                                    { label: "5 min", value: "5m" },
                                    { label: "15 min", value: "15m" },
                                    { label: "1 hr", value: "60m" },
                                    { label: "Today", value: "today" },
                                    { label: "All", value: "all" },
                                ].map((item) => (
                                    <button
                                        key={item.value}
                                        type="button"
                                        onClick={() => setTimeRange(item.value)}
                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                            timeRange === item.value
                                                ? "bg-slate-900 text-white"
                                                : "bg-white text-slate-500"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <LiveSection data={filteredActivities} />
                    </div>
)}
{activeTab === "admin" && (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900">Analytics</h2>
                                <p className="text-sm text-slate-500">Team-level trends and usage insights</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <select
                                    value={adminRange}
                                    onChange={(event) => setAdminRange(event.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                    <option value="today">Today</option>
                                    <option value="7d">Last 7 days</option>
                                    <option value="30d">Last 30 days</option>
                                    <option value="custom">Custom</option>
                                </select>
                                {adminRange === "custom" && (
                                    <>
                                        <input
                                            type="date"
                                            value={adminStart}
                                            onChange={(event) => setAdminStart(event.target.value)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                        />
                                        <input
                                            type="date"
                                            value={adminEnd}
                                            onChange={(event) => setAdminEnd(event.target.value)}
                                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                        />
                                    </>
                                )}
                                <select
                                    value={departmentFilter}
                                    onChange={(event) => setDepartmentFilter(event.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                    {departmentOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                                <select
                                    value={roleFilter}
                                    onChange={(event) => setRoleFilter(event.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                    {roleOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                                <select
                                    value={locationFilter}
                                    onChange={(event) => setLocationFilter(event.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                >
                                    {locationOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <KpiCard
                                title="Active Users"
                                value={adminAnalytics.activeUsers}
                                trend={null}
                                icon={<KpiIcon type="users" />}
                                color="gray"
                                data={null}
                            />
                            <KpiCard
                                title="Devices"
                                value={adminAnalytics.devices}
                                trend={null}
                                icon={<KpiIcon type="users" />}
                                color="gray"
                                data={null}
                            />
                            <KpiCard
                                title="Productivity %"
                                value={`${adminAnalytics.productivityPercent}%`}
                                trend={`${adminAnalytics.productivityDelta}%`}
                                trendType={adminAnalytics.productivityDelta >= 0 ? "up" : "down"}
                                subtext="vs previous period"
                                icon={<KpiIcon type="bolt" />}
                                color="green"
                                data={null}
                            />
                            <KpiCard
                                title="Total Active Time"
                                value={formatDuration(adminAnalytics.totalSeconds)}
                                trend={null}
                                icon={<KpiIcon type="clock" />}
                                color="blue"
                                data={null}
                            />
                            <KpiCard
                                title="Productive Time"
                                value={formatDuration(adminAnalytics.productiveSeconds)}
                                trend={null}
                                icon={<KpiIcon type="bolt" />}
                                color="green"
                                data={null}
                            />
                            <KpiCard
                                title="Top App"
                                value={adminAnalytics.topApp ? cleanAppName(adminAnalytics.topApp.name) : "-"}
                                trend={adminAnalytics.topApp ? `${Math.round((adminAnalytics.topApp.seconds / (adminAnalytics.totalSeconds || 1)) * 100)}% share` : null}
                                trendType="up"
                                icon={<KpiIcon type="bolt" />}
                                color="blue"
                                data={null}
                            />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            <InsightBanner
                                text={adminAnalytics.productivityDelta >= 0
                                    ? `Productivity increased by ${adminAnalytics.productivityDelta}%`
                                    : `Productivity decreased by ${Math.abs(adminAnalytics.productivityDelta)}%`}
                                tone={adminAnalytics.productivityDelta >= 0 ? "positive" : "negative"}
                            />
                            <InsightBanner
                                text={adminAnalytics.topApp
                                    ? `${cleanAppName(adminAnalytics.topApp.name)} dominates usage`
                                    : "No app usage data"}
                                tone="neutral"
                            />
                            <InsightBanner
                                text={adminAnalytics.idleSeconds > 0
                                    ? `Idle time recorded across ${adminAnalytics.activeUsers} users`
                                    : "No idle time detected"}
                                tone={adminAnalytics.idleSeconds > 0 ? "warning" : "neutral"}
                            />
                        </div>
                        <AnalyticsCharts
                            productivitySeries={adminSeries}
                            appBars={adminAnalytics.topAppsByTime.map((app) => ({
                                name: cleanAppName(app.name),
                                time: Math.round(app.seconds / 60),
                            }))}
                        />
                        <AppDistribution
                            categories={adminAnalytics.categorySeconds}
                            topAppLabel={adminAnalytics.topApp ? `${cleanAppName(adminAnalytics.topApp.name)}` : "No data"}
                        />
                        <Heatmap data={heatmapData} />
                    </div>
)}
            </div>
        </div>
    );
}
