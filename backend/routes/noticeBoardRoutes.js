// backend/routes/noticeBoardRoutes.js
const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');
const { sendNoticeBoardEmail } = require('../services/emailService');

// ── GET /api/notice-board/active  (no auth — called by navbar for all users)
router.get('/active', async (req, res) => {
    const start = Date.now();

    console.log('📢 GET /api/notice-board/active - START');

    try {
        const { data, error } = await supabase
            .from('notice_board')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        console.log(
            '📢 GET /api/notice-board/active - DB finished:',
            Date.now() - start,
            'ms'
        );

        if (error) {
            console.error('❌ Notice board DB error:', error);
            throw error;
        }

        console.log('📢 Notice returned:', data);

        res.json({
            success: true,
            notice: data || null
        });

    } catch (err) {
        console.error(
            '❌ Notice board /active failed after',
            Date.now() - start,
            'ms:',
            err
        );

        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ── GET /api/notice-board  (admin — list all)
router.get('/', async (req, res) => {
    if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role))
        return res.status(403).json({ success: false, message: 'Admin only' });
    try {
        const { data, error } = await supabase
            .from('notice_board')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, notices: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/notice-board  (admin — create)
router.post('/', async (req, res) => {
    if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role))
        return res.status(403).json({ success: false, message: 'Admin only' });
    try {
        const {
            title, message, display_type = 'marquee', direction = 'right_to_left',
            text_color = '#2B2B2B', background_color = '#FFF8E7',
            font_style = 'normal', is_active = false
        } = req.body;

        if (!title || !message)
            return res.status(400).json({ success: false, message: 'title and message are required' });

        // If activating, deactivate all others first
        if (is_active) {
            await supabase.from('notice_board').update({ is_active: false }).eq('is_active', true);
        }

        const { data, error } = await supabase
            .from('notice_board')
            .insert([{
                title, message, display_type, direction,
                text_color, background_color, font_style,
                is_active,
                created_by: req.user?.employeeId || 'admin',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, notice: data });

        // Non-blocking: email employees only when the notice is being activated
        if (is_active) {
            supabase.from('employees').select('email, first_name, last_name').eq('status', 'active')
                .then(({ data: employees }) => {
                    sendNoticeBoardEmail(employees || [], {
                        title,
                        message,
                        createdBy: req.user?.employeeId || 'Admin',
                    }).catch(err => console.error('⚠️ Notice email error:', err.message));
                })
                .catch(err => console.error('⚠️ Notice email fetch error:', err.message));
        }

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PUT /api/notice-board/:id  (admin — update)
router.put('/:id', async (req, res) => {
    if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role))
        return res.status(403).json({ success: false, message: 'Admin only' });
    try {
        const { id } = req.params;
        const updates = { ...req.body, updated_at: new Date().toISOString() };

        // If activating this one, deactivate others
        if (updates.is_active === true) {
            await supabase.from('notice_board')
                .update({ is_active: false })
                .eq('is_active', true)
                .neq('id', id);
        }

        const { data, error } = await supabase
            .from('notice_board')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, notice: data });

        // Non-blocking: email employees only when notice is being activated via PUT
        if (updates.is_active === true) {
            supabase.from('employees').select('email, first_name, last_name').eq('status', 'active')
                .then(({ data: employees }) => {
                    sendNoticeBoardEmail(employees || [], {
                        title: data.title,
                        message: data.message,
                        createdBy: req.user?.employeeId || 'Admin',
                    }).catch(err => console.error('⚠️ Notice email error:', err.message));
                })
                .catch(err => console.error('⚠️ Notice email fetch error:', err.message));
        }

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DELETE /api/notice-board/:id  (admin)
router.delete('/:id', async (req, res) => {
    if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role))
        return res.status(403).json({ success: false, message: 'Admin only' });
    try {
        const { error } = await supabase.from('notice_board').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
