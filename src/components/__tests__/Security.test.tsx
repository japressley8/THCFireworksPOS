import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../../App';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke
const mockInvoke = invoke as any;

describe('Admin Security Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  const setupMockInvoke = (overrides: Record<string, any> = {}, settingOverrides: Record<string, any> = {}) => {
    mockInvoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'get_setting' && args?.key && settingOverrides[args.key] !== undefined) {
        return Promise.resolve(settingOverrides[args.key]);
      }
      if (overrides[cmd] !== undefined) {
        return Promise.resolve(overrides[cmd]);
      }
      if (cmd === 'get_items') return Promise.resolve([]);
      if (cmd === 'get_discounts') return Promise.resolve([]);
      if (cmd === 'get_sales') return Promise.resolve([]);
      if (cmd === 'get_taxes') return Promise.resolve([]);
      return Promise.resolve(null);
    });
  };

  it('shows password prompt modal when admin password is set and user clicks Admin tab', async () => {
    setupMockInvoke({}, {
      // Hash of "pass123" is "9b87...4c"
      admin_password_hash: '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c'
    });

    render(<App />);

    // Click Admin Nav tab
    const adminBtn = screen.getByRole('button', { name: /Admin/i });
    fireEvent.click(adminBtn);

    // Should show Admin Authentication Modal
    await waitFor(() => {
      expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
      expect(screen.getByLabelText('Enter Admin Password')).toBeInTheDocument();
    });
  });

  it('shows error on wrong password, unlocks on correct password', async () => {
    // Hash of "pass123"
    const correctHash = '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c';
    setupMockInvoke({}, {
      admin_password_hash: correctHash
    });

    render(<App />);

    // Click Admin Nav
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));

    // Input wrong password
    const pwdInput = await screen.findByLabelText('Enter Admin Password');
    fireEvent.change(pwdInput, { target: { value: 'wrongpass' } });

    const submitBtn = screen.getByRole('button', { name: /Unlock Console/i });
    fireEvent.click(submitBtn);

    // Verify error is shown
    const errorMsg = await screen.findByText('Invalid Admin Password. Please try again.');
    expect(errorMsg).toBeInTheDocument();

    // Input correct password "pass123"
    fireEvent.change(pwdInput, { target: { value: 'pass123' } });
    fireEvent.click(submitBtn);

    // Modal should disappear, and Admin view is shown (we search for Manager Admin Console header)
    await waitFor(() => {
      expect(screen.queryByText('Admin Authentication')).not.toBeInTheDocument();
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });
  });

  it('allows recovery via security question', async () => {
    // Hash of "firstpet" is "4278...f3"
    const correctQuestion = 'What was the name of your first pet?';
    const correctAnswerHash = '4278711d7b8d91dd6c757c98724a79dc61a2aa3e18fa3e881adf1fd33457dcf3';
    const correctPwdHash = '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c';

    setupMockInvoke({}, {
      admin_password_hash: correctPwdHash,
      admin_security_question: correctQuestion,
      admin_security_answer_hash: correctAnswerHash
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));

    // Click Forgot Password?
    const forgotBtn = await screen.findByRole('button', { name: /Forgot Password\?/i });
    fireEvent.click(forgotBtn);

    // Should show security question recovery tab by default
    const questionText = await screen.findByText(correctQuestion);
    expect(questionText).toBeInTheDocument();

    // Submit incorrect answer
    const answerInput = screen.getByLabelText('Your Answer');
    fireEvent.change(answerInput, { target: { value: 'wronganswer' } });

    const submitBtn = screen.getByRole('button', { name: /Verify & Unlock/i });
    fireEvent.click(submitBtn);

    const errorMsg = await screen.findByText('Incorrect security question answer.');
    expect(errorMsg).toBeInTheDocument();

    // Submit correct answer "firstpet"
    fireEvent.change(answerInput, { target: { value: 'firstpet' } });
    fireEvent.click(submitBtn);

    // Admin console unlocked
    await waitFor(() => {
      expect(screen.queryByText('Admin Authentication')).not.toBeInTheDocument();
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });
  });

  it('allows recovery via recovery key', async () => {
    // Recovery key "ABCD-1234-EFGH-5678" -> stripped normalized: "ABCD1234EFGH5678"
    // Hash of normalized is "be105af532593b07b857dbbb0012fc12a939efb515656aa111fc0120993c0609"
    const correctPwdHash = '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c';
    const correctKeyHash = 'be105af532593b07b857dbbb0012fc12a939efb515656aa111fc0120993c0609';

    setupMockInvoke({}, {
      admin_password_hash: correctPwdHash,
      admin_recovery_key_hash: correctKeyHash
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));

    const forgotBtn = await screen.findByRole('button', { name: /Forgot Password\?/i });
    fireEvent.click(forgotBtn);

    // Switch to Recovery Key tab
    const keyTabBtn = await screen.findByRole('button', { name: /Recovery Key/i });
    fireEvent.click(keyTabBtn);

    // Enter wrong key
    const keyInput = screen.getByLabelText('Enter 16-Character Recovery Key');
    fireEvent.change(keyInput, { target: { value: 'WRONG-KEY-HERE-123' } });

    const submitBtn = screen.getByRole('button', { name: /Verify & Unlock/i });
    fireEvent.click(submitBtn);

    const errorMsg = await screen.findByText('Invalid Recovery Key.');
    expect(errorMsg).toBeInTheDocument();

    // Enter correct recovery key
    fireEvent.change(keyInput, { target: { value: 'ABCD-1234-EFGH-5678' } });
    fireEvent.click(submitBtn);

    // Admin console unlocked
    await waitFor(() => {
      expect(screen.queryByText('Admin Authentication')).not.toBeInTheDocument();
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });
  });

  it('bypasses password gate completely if developer password bypass setting is enabled', async () => {
    const correctPwdHash = '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c';
    setupMockInvoke({}, {
      admin_password_hash: correctPwdHash,
      dev_password_bypass: 'true'
    });

    render(<App />);

    // Click Admin Nav tab
    const adminBtn = screen.getByRole('button', { name: /Admin/i });
    fireEvent.click(adminBtn);

    // Should bypass password gate and immediately display Admin console
    await waitFor(() => {
      expect(screen.queryByText('Admin Authentication')).not.toBeInTheDocument();
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });
  });

  it('locks the admin console after the customizable inactivity timeout', async () => {
    setupMockInvoke({}, {
      admin_password_hash: '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c',
      admin_password_timeout: '5'
    });

    render(<App />);

    // Click Admin Nav and input correct password "pass123" to unlock
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    const pwdInput = await screen.findByLabelText('Enter Admin Password');
    fireEvent.change(pwdInput, { target: { value: 'pass123' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock Console/i }));

    // Verify Admin console is shown under real timers
    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Switch to fake timers
    vi.useFakeTimers();

    // Trigger window activity event to reschedule the timer under fake timers
    fireEvent.click(window);

    // Advance time by 4 minutes (less than 5 min timeout) - console should remain unlocked
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();

    // Advance time by another 2 minutes (exceeding 5 min timeout)
    vi.advanceTimersByTime(2 * 60 * 1000);

    // Restore real timers so that waitFor can verify the lock redirect
    vi.useRealTimers();

    // Verify console is auto-locked and redirected to register tab
    await waitFor(() => {
      expect(screen.queryByText('Manager Admin Console')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sales Register/i })).toHaveClass('bg-custom-primary');
    });
  });

  it('allows changing or disabling the admin password via security question or recovery key', async () => {
    const correctHash = '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c';
    const securityQuestion = 'What was the name of your first pet?';
    const securityAnswerHash = '4278711d7b8d91dd6c757c98724a79dc61a2aa3e18fa3e881adf1fd33457dcf3';
    const recoveryKeyHash = 'fc085fd244840d2105151528646b9eb9a68574c7e62a2bb7f55b55bb55bb55bb';

    setupMockInvoke({
      save_setting: vi.fn().mockResolvedValue(null)
    }, {
      admin_password_hash: correctHash,
      admin_security_question: securityQuestion,
      admin_security_answer_hash: securityAnswerHash,
      admin_recovery_key_hash: recoveryKeyHash
    });

    render(<App />);

    // Unlock Admin Console
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    const pwdInput = await screen.findByLabelText('Enter Admin Password');
    fireEvent.change(pwdInput, { target: { value: 'pass123' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock Console/i }));

    // Click Settings Sub-tab
    const settingsTabBtn = await screen.findByRole('button', { name: /Settings/i });
    fireEvent.click(settingsTabBtn);

    // Edit Security Details
    const editSecurityBtn = await screen.findByRole('button', { name: /Edit Security/i });
    fireEvent.click(editSecurityBtn);

    // Verify verification options are rendered
    expect(screen.getAllByRole('button', { name: /Question/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Recovery Key/i }).length).toBeGreaterThan(0);
  });

  it('locks immediately when the admin page is clicked off of if configured so', async () => {
    setupMockInvoke({}, {
      admin_password_hash: '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c',
      admin_password_timeout: '-1'
    });

    render(<App />);

    // Unlock Admin Console
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    const pwdInput = await screen.findByLabelText('Enter Admin Password');
    fireEvent.change(pwdInput, { target: { value: 'pass123' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock Console/i }));

    // Verify Admin console is shown
    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Click off of the Admin page (click Sales Register tab)
    fireEvent.click(screen.getByRole('button', { name: /Sales Register/i }));

    // Click back to Admin page
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));

    // Verify it is locked (prompts for password again)
    await waitFor(() => {
      expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
    });
  });

  it('remains unlocked when moving away from admin tab if timeout is only on app close', async () => {
    setupMockInvoke({}, {
      admin_password_hash: '9b8769a4a742959a2d0298c36fb70623f2dfacda8436237df08d8dfd5b37374c',
      admin_password_timeout: '0'
    });

    render(<App />);

    // Unlock Admin Console
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));
    const pwdInput = await screen.findByLabelText('Enter Admin Password');
    fireEvent.change(pwdInput, { target: { value: 'pass123' } });
    fireEvent.click(screen.getByRole('button', { name: /Unlock Console/i }));

    // Verify Admin console is shown
    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });

    // Click off of the Admin page
    fireEvent.click(screen.getByRole('button', { name: /Sales Register/i }));

    // Click back to Admin page
    fireEvent.click(screen.getByRole('button', { name: /Admin/i }));

    // Verify it is NOT locked (Manager Admin Console is directly visible without entering password again)
    await waitFor(() => {
      expect(screen.getByText('Manager Admin Console')).toBeInTheDocument();
    });
  });
});
