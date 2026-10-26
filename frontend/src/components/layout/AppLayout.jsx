import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Flag, GraduationCap, LayoutDashboard, LogOut, Menu, Newspaper, Search, User, Users, X } from 'lucide-react';
import { GraduationCap, LayoutDashboard, LogOut, Menu, MessageSquare, Search, User, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../common/Avatar';
import NotificationBell from '../notifications/NotificationBell';

// Only links to pages that exist. New phases add their links here.
const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/feed', label: 'Feed', icon: Newspaper },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/profile', label: 'My Profile', icon: User },
];

function NavLinks({ onNavigate, isAdmin }) {
  const visibleLinks = isAdmin ? [...links, { to: '/admin/reports', label: 'Reports', icon: Flag }] : links;
  return (
    <nav className="space-y-1" aria-label="Main">
      {visibleLinks.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          <Icon className="h-5 w-5" aria-hidden="true" /> {label}
        </NavLink>
      ))}
    </nav>
  );
}

const Brand = () => (
  <div className="flex items-center gap-2 text-lg font-bold text-indigo-700">
    <GraduationCap className="h-6 w-6" aria-hidden="true" /> CampusConnect
  </div>
);

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/students?q=${encodeURIComponent(query.trim())}`);
  };
  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-6 px-2"><Brand /></div>
        <NavLinks isAdmin={user.role === 'admin'} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-64 bg-white p-4">
            <div className="mb-6 flex items-center justify-between px-2">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <NavLinks isAdmin={user.role === 'admin'} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-6 w-6" /></button>
          <form onSubmit={submitSearch} role="search" className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search students"
              placeholder="Search students by name, college or skill"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <button onClick={() => navigate('/profile')} aria-label="My profile"><Avatar user={user} size={32} /></button>
            <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-slate-600 hover:text-red-600">
              <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
