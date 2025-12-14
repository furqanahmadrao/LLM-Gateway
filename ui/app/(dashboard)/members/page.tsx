'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '../../../lib/demoMode';

// Member role type
type MemberRole = 'admin' | 'member' | 'viewer';

// Team member interface matching backend types
interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  name: string | null;
  role: MemberRole;
  createdAt: Date;
  lastActiveAt: Date | null;
}

// Mock data for demonstration (only used when DEMO_MODE is enabled)
const mockMembers: TeamMember[] = [
  {
    id: '1',
    teamId: 'team-1',
    userId: 'user-1',
    email: 'admin@example.com',
    name: 'Alice Johnson',
    role: 'admin',
    createdAt: new Date('2024-10-01T10:00:00'),
    lastActiveAt: new Date('2024-12-04T14:30:00'),
  },
  {
    id: '2',
    teamId: 'team-1',
    userId: 'user-2',
    email: 'bob@example.com',
    name: 'Bob Smith',
    role: 'member',
    createdAt: new Date('2024-10-15T09:00:00'),
    lastActiveAt: new Date('2024-12-04T11:15:00'),
  },
  {
    id: '3',
    teamId: 'team-1',
    userId: 'user-3',
    email: 'carol@example.com',
    name: 'Carol Williams',
    role: 'member',
    createdAt: new Date('2024-11-01T14:00:00'),
    lastActiveAt: new Date('2024-12-03T16:45:00'),
  },
  {
    id: '4',
    teamId: 'team-1',
    userId: 'user-4',
    email: 'david@example.com',
    name: null,
    role: 'viewer',
    createdAt: new Date('2024-11-20T11:30:00'),
    lastActiveAt: null,
  },
];

function RoleBadge({ role }: { role: MemberRole }) {
  const styles = {
    admin: 'bg-accent-muted text-accent border-accent/30',
    member: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    viewer: 'bg-[rgba(255,255,255,0.08)] text-text-secondary border-border',
  };

  const labels = {
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-badge border ${styles[role]}`}>
      {labels[role]}
    </span>
  );
}


function formatLastActive(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Add/Edit Member Modal Component
interface MemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (email: string, name: string, role: MemberRole) => void;
  editingMember: TeamMember | null;
}

function MemberModal({ isOpen, onClose, onSave, editingMember }: MemberModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens/closes or editing member changes
  useEffect(() => {
    if (isOpen) {
      if (editingMember) {
        setEmail(editingMember.email);
        setName(editingMember.name || '');
        setRole(editingMember.role);
      } else {
        setEmail('');
        setName('');
        setRole('member');
      }
    }
  }, [isOpen, editingMember]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    onSave(email, name, role);
    setIsSaving(false);
  };

  const handleClose = () => {
    setEmail('');
    setName('');
    setRole('member');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            {editingMember ? 'Edit Member' : 'Add Member'}
          </h2>
          <button onClick={handleClose} className="p-1 text-text-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">
                Email <span className="text-status-error">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                disabled={!!editingMember}
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                required
              />
            </div>

            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">
                Role <span className="text-status-error">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              >
                <option value="admin">Admin - Full access to all settings</option>
                <option value="member">Member - Can manage API keys and view usage</option>
                <option value="viewer">Viewer - Read-only access</option>
              </select>
              <p className="mt-1 text-xs text-text-muted">
                {role === 'admin' && 'Admins can manage team members, providers, and all settings.'}
                {role === 'member' && 'Members can create API keys and view usage data.'}
                {role === 'viewer' && 'Viewers can only view data without making changes.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !email.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingMember ? 'Update Member' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Remove Member Confirmation Modal Component
interface RemoveModalProps {
  isOpen: boolean;
  memberName: string | null;
  memberEmail: string;
  onClose: () => void;
  onConfirm: () => void;
  isRemoving: boolean;
}

function RemoveModal({ isOpen, memberName, memberEmail, onClose, onConfirm, isRemoving }: RemoveModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-status-error">Remove Member</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-status-error/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-status-error" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-primary">
                Are you sure you want to remove this member from the team? This action cannot be undone.
              </p>
              <div className="mt-2 bg-background/50 rounded-button p-2">
                <p className="text-sm font-medium text-text-primary">{memberName || 'Unnamed Member'}</p>
                <p className="text-xs text-text-muted">{memberEmail}</p>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                This member will immediately lose access to all team resources.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isRemoving}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRemoving}
            className="px-4 py-2 bg-status-error hover:bg-status-error/80 text-white rounded-button text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isRemoving ? 'Removing...' : 'Remove Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersPage() {
  // Use mock data only in demo mode, otherwise start with empty array
  const [members, setMembers] = useState<TeamMember[]>(isDemoMode() ? mockMembers : []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleAddMember = () => {
    setEditingMember(null);
    setIsModalOpen(true);
  };

  const handleEditMember = (member: TeamMember) => {
    setEditingMember(member);
    setIsModalOpen(true);
  };

  const handleSaveMember = (email: string, name: string, role: MemberRole) => {
    if (editingMember) {
      // Update existing member
      setMembers(prev => prev.map(m =>
        m.id === editingMember.id
          ? { ...m, name: name || null, role }
          : m
      ));
    } else {
      // Add new member
      const newMember: TeamMember = {
        id: Date.now().toString(),
        teamId: 'team-1',
        userId: `user-${Date.now()}`,
        email,
        name: name || null,
        role,
        createdAt: new Date(),
        lastActiveAt: null,
      };
      setMembers(prev => [...prev, newMember]);
    }
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleRemoveClick = (member: TeamMember) => {
    setRemoveTarget(member);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    
    setIsRemoving(true);
    // Simulate API call - will be replaced with actual API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setMembers(prev => prev.filter(m => m.id !== removeTarget.id));
    
    setIsRemoving(false);
    setRemoveTarget(null);
  };

  const handleCloseRemoveModal = () => {
    if (!isRemoving) {
      setRemoveTarget(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Members</h1>
        <button
          onClick={handleAddMember}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-button text-sm font-medium transition-colors"
        >
          Add Member
        </button>
      </div>

      <div className="bg-panel rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Member</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Email</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Role</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Last Active</th>
              <th className="text-right px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-border-subtle last:border-b-0 hover:bg-panel-hover transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center">
                      <span className="text-sm font-bold text-accent">
                        {(member.name || member.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className={member.name ? 'text-text-primary' : 'text-text-muted italic'}>
                      {member.name || 'Unnamed'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {member.email}
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={member.role} />
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {formatLastActive(member.lastActiveAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleEditMember(member)}
                      className="p-2 text-text-muted hover:text-text-primary hover:bg-panel-hover rounded-button transition-colors"
                      title="Edit member"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRemoveClick(member)}
                      className="p-2 text-status-error hover:text-red-300 hover:bg-status-error/10 rounded-button transition-colors"
                      title="Remove member"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No team members yet. Click &quot;Add Member&quot; to invite someone.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <MemberModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveMember}
        editingMember={editingMember}
      />

      <RemoveModal
        isOpen={removeTarget !== null}
        memberName={removeTarget?.name ?? null}
        memberEmail={removeTarget?.email ?? ''}
        onClose={handleCloseRemoveModal}
        onConfirm={handleConfirmRemove}
        isRemoving={isRemoving}
      />
    </div>
  );
}
