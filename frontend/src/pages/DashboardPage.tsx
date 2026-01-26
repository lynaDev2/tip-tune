
import React, { useState, useEffect, useCallback } from 'react';
import { fetchDashboardStats, fetchTipsChartData, fetchTopTracks, fetchRecentTips, fetchUserProfile } from '../services/artistService';
import { ChartDataPoint, Tip, Track, UserProfile } from '../types';
import DashboardStats from '../components/dashboard/DashboardStats';
import TipsChart from '../components/dashboard/TipsChart';
import TopTracks from '../components/dashboard/TopTracks';
import RecentTips from '../components/dashboard/RecentTips';
import ProfileSection from '../components/dashboard/ProfileEdit';

const Dashboard: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Data states
    const [stats, setStats] = useState<{ totalTips?: number; totalPlays?: number; supporterCount?: number }>({});
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [topTracks, setTopTracks] = useState<Track[]>([]);
    const [recentTips, setRecentTips] = useState<Tip[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile | undefined>(undefined);

    const loadDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [statsData, chartData, topTracksData, recentTipsData, userProfileData] = await Promise.all([
                fetchDashboardStats(),
                fetchTipsChartData(),
                fetchTopTracks(),
                fetchRecentTips(),
                fetchUserProfile(),
            ]);
            setStats(statsData);
            setChartData(chartData);
            setTopTracks(topTracksData);
            setRecentTips(recentTipsData);
            setUserProfile(userProfileData);
        } catch (err) {
            setError('Failed to load dashboard data. Please try again later.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Simulate tip updates with polling (for demo purposes)
    // Note: For production, replace with actual WebSocket integration using socket.io-client
    // See useNotifications hook for example WebSocket implementation
    useEffect(() => {
        const interval = setInterval(() => {
            if(!isLoading){
                 const newTip: Tip = {
                    id: `tip_${Date.now()}`,
                    tipperName: 'Realtime Fan',
                    tipperAvatar: 'https://i.pravatar.cc/150?u=realtime',
                    amount: parseFloat((Math.random() * 20).toFixed(2)),
                    message: 'Just got this tip!',
                    timestamp: new Date().toISOString(),
                    trackId: topTracks[Math.floor(Math.random() * topTracks.length)]?.id,
                };

                setRecentTips(prevTips => [newTip, ...prevTips]);
                setStats(prevStats => ({
                    ...prevStats,
                    totalTips: (prevStats.totalTips || 0) + newTip.amount
                }));
            }
        }, 15000); // New tip every 15 seconds

        return () => clearInterval(interval);
    }, [isLoading, topTracks]);

    if (error) {
        return <div className="text-center py-10 text-red-500 bg-red-100 rounded-lg">{error}</div>;
    }

    return (
        <div className="space-y-6">
            <DashboardStats 
                totalTips={stats.totalTips} 
                totalPlays={stats.totalPlays} 
                supporterCount={stats.supporterCount}
                isLoading={isLoading}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                <div className="lg:col-span-2 h-full">
                    <TipsChart data={chartData} isLoading={isLoading} />
                </div>
                <div className="lg:col-span-1 h-full">
                    <TopTracks tracks={topTracks} isLoading={isLoading} />
                </div>
            </div>

            <RecentTips tips={recentTips} tracks={topTracks} isLoading={isLoading} />

            <ProfileSection profile={userProfile} isLoading={isLoading} />
        </div>
    );
};

export default Dashboard;
