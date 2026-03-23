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
} from "recharts";

const API_URL = `${import.meta.env.VITE_API_URL}/activities`;
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

function SummaryCard({ label, value, delta, deltaPositive }) {
    return (
        <div className="rounded-2xl bg-white p-5 shadow-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {label}
            </div>
            <div className="mt-3 text-2xl font-semibold text-slate-900">
                {value}
            </div>
            {delta !== null && (
                <div
                    className={`mt-2 text-sm font-medium ${
                        deltaPositive ? "text-emerald-600" : "text-rose-600"
                    }`}
                >
                    {deltaPositive ? "Up" : "Down"} {delta}
                </div>
            )}
        </div>
    );
}

function SummaryBar({ stats }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Users" value={stats.totalUsers} delta={null} />
            <SummaryCard
                label="Average Productivity"
                value={`${stats.avgProductivity}%`}
                delta={null}
            />
            <SummaryCard
                label="Total Active Time"
                value={formatDuration(stats.totalActiveSeconds)}
                delta={stats.deltaTotalLabel}
                deltaPositive={stats.deltaTotalSeconds >= 0}
            />
            <SummaryCard
                label="Productive Time"
                value={formatDuration(stats.totalProductiveSeconds)}
                delta={stats.deltaProductiveLabel}
                deltaPositive={stats.deltaProductiveSeconds >= 0}
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
    const productivityLevel = user.productivity >= 80 ? "high" : user.productivity >= 50 ? "medium" : "low";
    const [tab, setTab] = useState("apps");

    return (
        <div className="rounded-2xl bg-white p-5 shadow-card transition hover:shadow-lg">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-semibold text-slate-900">
                        {user.username}
                    </div>
                    <div className="text-xs text-slate-500">{user.hostname}</div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge tone={productivityLevel}>
                        {productivityLevel === "high"
                            ? "High"
                            : productivityLevel === "medium"
                            ? "Medium"
                            : "Low"}
                    </Badge>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                        {collapsed ? "Expand" : "Collapse"}
                    </button>
                </div>
            </div>

            <div className="mt-4 flex items-end justify-between">
                <div className="text-3xl font-semibold text-slate-900">
                    {user.productivity}%
                </div>
                <div className="text-xs text-slate-500">
                    Focus {user.focusScore}%
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <div>Active {formatDuration(user.activeSeconds)}</div>
                <div>Idle {formatDuration(user.idleSeconds)}</div>
                <div>Total {formatDuration(user.totalSeconds)}</div>
            </div>

            {comparison && (
                <div className="mt-2 text-xs text-slate-500">
                    Delta vs yesterday: {formatDelta(comparison.today.totalSeconds - comparison.yesterday.totalSeconds)}
                </div>
            )}

            {user.idleAlert && (
                <div className="mt-3">
                    <Badge tone="alert">Idle for {formatDuration(user.idleSeconds)}</Badge>
                </div>
            )}

            {!collapsed && (
                <div className="mt-4 space-y-4">
                    <div>
                        <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-400">
                            <span>Productivity Split</span>
                            <span>
                                {user.categoryPercent.productive}% / {user.categoryPercent.neutral}% / {user.categoryPercent.unproductive}%
                            </span>
                        </div>
                        <SegmentedBar
                            productive={user.categoryPercent.productive}
                            neutral={user.categoryPercent.neutral}
                            unproductive={user.categoryPercent.unproductive}
                        />
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
                    </div>

                    {tab === "apps" ? (
                        <AppUsage apps={user.appUsage.slice(0, 5)} />
                    ) : (
                        <Timeline items={user.timeline} />
                    )}
                </div>
            )}
        </div>
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
                                    <td className="px-4 py-3 text-slate-700">{item.hostname}</td>
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
            if (!query) {
                return true;
            }
            const windowText = (item.active_window || "").toLowerCase();
            return windowText.includes(query);
        });
    }, [timeFilteredActivities, searchText, selectedHost]);

    const dailyActivities = useMemo(() => {
        if (!selectedDate) {
            return [];
        }
        const target = new Date(selectedDate + "T00:00:00");
        const dayStart = target.getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;

        return activities.filter((item) => {
            const ts = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
            return !Number.isNaN(ts) && ts >= dayStart && ts < dayEnd;
        });
    }, [activities, selectedDate]);

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

            return {
                hostname,
                username,
                totalSeconds,
                sessionSeconds,
                activeSeconds,
                idleSeconds,
                productiveSeconds,
                productivity,
                workStart,
                workEnd,
                totalSpanSeconds,
                idleAlert,
                focusScore,
                switchCount,
                categoryPercent,
                topApp: topAppEntry ? topAppEntry.name : "—",
                appUsage,
                timeline,
            };
        });
    }, [dailyActivities]);

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
                const target = `${user.username} ${user.hostname}`.toLowerCase();
                return target.includes(query);
            });
        }
        const sorted = [...list].sort((a, b) => {
            if (dailySort === "idle") {
                return b.idleSeconds - a.idleSeconds;
            }
            if (dailySort === "productivity") {
                return b.productivity - a.productivity;
            }
            if (dailySort === "total") {
                return b.totalSeconds - a.totalSeconds;
            }
            return b.activeSeconds - a.activeSeconds;
        });
        return sorted;
    }, [dailySummary, dailySearch, dailySort]);

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
                dailySummaryFiltered.reduce((sum, user) => sum + user.productivity, 0) / totalUsers
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
            deltaTotalLabel: dailyComparison.yesterdayTotal ? formatDelta(deltaTotalSeconds) : "—",
            deltaProductiveLabel: dailyComparison.yesterdayProductive ? formatDelta(deltaProductiveSeconds) : "—",
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
                    </div>
                </div>

                {error && (
                    <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {activeTab === "daily" ? (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-semibold text-slate-600">Date</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(event) => setSelectedDate(event.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                                />
                            </div>
                            <div className="text-xs text-slate-500">
                                {dailyActivities.length} events captured
                            </div>
                        </div>

                        <SummaryBar stats={dailyStats} />

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
                ) : (
                    <div className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <SummaryCard label="Active Users" value={analytics.activeUsers} delta={null} />
                            <SummaryCard label="Devices" value={analytics.activeUsers} delta={null} />
                            <SummaryCard
                                label="Top App"
                                value={
                                    analytics.topAppsByCount[0]
                                        ? `${cleanAppName(analytics.topAppsByCount[0].name)} (${analytics.topAppsByCount[0].percent}%)`
                                        : "—"
                                }
                                delta={null}
                            />
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                            <div className="rounded-2xl bg-white p-6 shadow-card">
                                <div className="mb-4 text-sm font-semibold text-slate-700">App Usage</div>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={chartData.pieData}
                                                dataKey="value"
                                                nameKey="name"
                                                outerRadius={90}
                                                innerRadius={40}
                                                paddingAngle={3}
                                            >
                                                {chartData.pieData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${entry.name}-${index}`}
                                                        fill={chartColors[index % chartColors.length]}
                                                    />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value} min`} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="rounded-2xl bg-white p-6 shadow-card">
                                <div className="mb-4 text-sm font-semibold text-slate-700">Time Spent</div>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData.barData}>
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(value) => `${value} min`} />
                                            <Bar dataKey="time" fill="#2563eb" radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

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
            </div>
        </div>
    );
}
