package com.diamondlink.contacts;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Contacts bridge that writes into a REAL device account (Google or the
 * first contacts-syncable account) instead of an unlinked local-only raw
 * contact. WhatsApp/Google Contacts only index contacts under a syncable
 * account. Also matches existing cards by normalized E.164 number so edits
 * update the SAME card in place instead of delete+recreate.
 */
@CapacitorPlugin(name = "NativeContactsBridge")
public class NativeContactsBridge extends Plugin {

    private static final String TAG = "NativeContactsBridge";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private ContentResolver cr() {
        return getContext().getContentResolver();
    }

    // ------------------------------------------------------------------
    // ACCOUNTS
    // ------------------------------------------------------------------

    @PluginMethod
    public void getAccounts(PluginCall call) {
        List<Account> accounts = listContactsAccounts();
        JSArray out = new JSArray();
        for (Account a : accounts) {
            JSObject o = new JSObject();
            o.put("type", a.type);
            o.put("name", a.name);
            try {
                o.put("syncable", ContentResolver.getIsSyncable(a, ContactsContract.AUTHORITY) > 0);
            } catch (SecurityException se) {
                o.put("syncable", false);
            }
            out.put(o);
        }
        call.resolve(new JSObject().put("accounts", out));
    }

    private List<Account> listContactsAccounts() {
        try {
            Account[] accounts = AccountManager.get(getContext()).getAccounts();
            List<Account> syncable = new ArrayList<>();
            List<Account> rest = new ArrayList<>();
            for (Account a : accounts) {
                try {
                    if (ContentResolver.getIsSyncable(a, ContactsContract.AUTHORITY) > 0) {
                        syncable.add(a);
                    } else {
                        rest.add(a);
                    }
                } catch (SecurityException ignored) {
                    rest.add(a);
                }
            }
            Collections.sort(syncable, (x, y) -> {
                if ("com.google".equals(x.type)) return -1;
                if ("com.google".equals(y.type)) return 1;
                return 0;
            });
            syncable.addAll(rest);
            return syncable;
        } catch (SecurityException se) {
            return Collections.emptyList();
        }
    }

    private String[] chooseAccount(String requestedType, String requestedName) {
        for (Account a : listContactsAccounts()) {
            if (requestedType != null && requestedName != null) {
                if (requestedType.equals(a.type) && requestedName.equals(a.name)) {
                    return new String[]{a.type, a.name};
                }
            } else if ("com.google".equals(a.type)) {
                try {
                    if (ContentResolver.getIsSyncable(a, ContactsContract.AUTHORITY) > 0) {
                        return new String[]{a.type, a.name};
                    }
                } catch (SecurityException ignored) {
                }
            }
        }
        if (requestedType != null && requestedName != null) {
            return new String[]{requestedType, requestedName};
        }
        return new String[]{null, null};
    }

    // ------------------------------------------------------------------
    // UPSERT (in-place edit or account-linked insert)
    // ------------------------------------------------------------------

    @PluginMethod
    public void upsertContact(PluginCall call) {
        final String givenName = str(call, "givenName");
        final String familyName = str(call, "familyName");
        final String phone = str(call, "phone");
        final String e164 = str(call, "e164");
        final String email = str(call, "email");
        final String note = str(call, "note");
        final String accountType = call.getString("accountType", null);
        final String accountName = call.getString("accountName", null);
        executor.execute(() -> {
            try {
                call.resolve(upsertSync(givenName, familyName, phone, e164, email, note, accountType, accountName));
            } catch (Exception e) {
                android.util.Log.e(TAG, "upsertContact failed", e);
                call.reject("upsertContact: " + e.getMessage(), e);
            }
        });
    }

    private JSObject upsertSync(String givenName, String familyName, String phone, String e164,
                                String email, String note, String accountType, String accountName) {
        String phoneDigits = normalizeNumber(phone.isEmpty() ? e164 : phone);
        if (phoneDigits.isEmpty()) {
            throw new IllegalArgumentException("phone number required");
        }
        String normalizedE164 = e164.isEmpty() ? "+" + phoneDigits : e164;

        DataMatch existing = findPhoneMatch(phoneDigits);

        if (existing != null) {
            updatePhoneData(existing.dataId, phone, normalizedE164);
            upsertStructuredName(existing.rawId, givenName, familyName);
            upsertEmail(existing.rawId, email);
            upsertNote(existing.rawId, note);
            String[] acct = readRawAccount(existing.rawId);
            JSObject out = new JSObject();
            out.put("contactId", readContactId(existing.rawId));
            out.put("rawContactId", existing.rawId);
            out.put("updated", true);
            out.put("accountType", acct[0]);
            out.put("accountName", acct[1]);
            return out;
        }

        String[] acct = chooseAccount(accountType, accountName);
        ContentValues raw = new ContentValues();
        if (acct[0] != null && acct[1] != null) {
            raw.put(ContactsContract.RawContacts.ACCOUNT_TYPE, acct[0]);
            raw.put(ContactsContract.RawContacts.ACCOUNT_NAME, acct[1]);
        }
        Uri rawUri = cr().insert(ContactsContract.RawContacts.CONTENT_URI, raw);
        if (rawUri == null) {
            throw new IllegalStateException("RawContacts insert returned null URI");
        }
        String rawId = ContentUris.parseId(rawUri) + "";

        upsertStructuredName(rawId, givenName, familyName);
        insertRow(ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE, rawId,
                new Value(ContactsContract.CommonDataKinds.Phone.NUMBER, phone),
                new Value(ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER, normalizedE164),
                new Value(ContactsContract.CommonDataKinds.Phone.TYPE, ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE),
                new Value(ContactsContract.CommonDataKinds.Phone.LABEL, "mobile"),
                new Value(ContactsContract.CommonDataKinds.Phone.IS_PRIMARY, 1));
        if (email != null && !email.isEmpty()) {
            insertRow(ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE, rawId,
                    new Value(ContactsContract.CommonDataKinds.Email.ADDRESS, email),
                    new Value(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_WORK),
                    new Value(ContactsContract.CommonDataKinds.Email.LABEL, "work"),
                    new Value(ContactsContract.CommonDataKinds.Email.IS_PRIMARY, 1));
        }
        if (note != null && !note.isEmpty()) {
            insertRow(ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE, rawId,
                    new Value(ContactsContract.CommonDataKinds.Note.NOTE, note));
        }

        JSObject out = new JSObject();
        out.put("contactId", readContactId(rawId));
        out.put("rawContactId", rawId);
        out.put("updated", false);
        out.put("accountType", acct[0]);
        out.put("accountName", acct[1]);
        return out;
    }

    @PluginMethod
    public void deleteByPhone(PluginCall call) {
        final String phone = str(call, "phone");
        executor.execute(() -> {
            try {
                int deleted = deleteByPhoneSync(phone);
                call.resolve(new JSObject().put("deleted", deleted));
            } catch (Exception e) {
                android.util.Log.e(TAG, "deleteByPhone failed", e);
                call.reject("deleteByPhone: " + e.getMessage(), e);
            }
        });
    }

    private int deleteByPhoneSync(String phone) {
        String digits = normalizeNumber(phone);
        if (digits.isEmpty()) return 0;
        Set<String> rawIds = new HashSet<>();
        try (Cursor c = cr().query(ContactsContract.Data.CONTENT_URI,
                new String[]{ContactsContract.Data.RAW_CONTACT_ID,
                        ContactsContract.CommonDataKinds.Phone.NUMBER,
                        ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER},
                ContactsContract.Data.MIMETYPE + " = ?",
                new String[]{ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE}, null)) {
            while (c != null && c.moveToNext()) {
                String number = c.getString(c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER));
                String normalized = c.getString(c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER));
                if (matchesPhone(number, normalized, digits)) {
                    rawIds.add(c.getString(c.getColumnIndexOrThrow(ContactsContract.Data.RAW_CONTACT_ID)));
                }
            }
        }
        int removed = 0;
        for (String rawId : rawIds) {
            removed += cr().delete(ContactsContract.RawContacts.CONTENT_URI,
                    ContactsContract.RawContacts._ID + " = ?", new String[]{rawId});
        }
        return removed;
    }

    @PluginMethod
    public void syncAll(PluginCall call) {
        final String accountType = call.getString("accountType", null);
        final String accountName = call.getString("accountName", null);
        final JSArray contacts = call.getArray("contacts");
        executor.execute(() -> {
            int created = 0, updated = 0, failed = 0;
            try {
                JSONArray arr = call.getArray("contacts");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject c = arr.getJSONObject(i);
                    try {
                        JSObject r = upsertSync(
                                c.optString("givenName", ""),
                                c.optString("familyName", ""),
                                c.optString("phone", ""),
                                c.optString("e164", ""),
                                c.optString("email", ""),
                                c.optString("notes", ""),
                                accountType, accountName);
                        if (r.getBoolean("updated")) updated++;
                        else created++;
                    } catch (Exception e) {
                        android.util.Log.w(TAG, "syncAll item failed: " + c.optString("phone"), e);
                        failed++;
                    }
                }
                call.resolve(new JSObject()
                        .put("processed", arr.length())
                        .put("created", created)
                        .put("updated", updated)
                        .put("failed", failed));
            } catch (Exception e) {
                call.reject("syncAll: " + e.getMessage(), e);
            }
        });
    }

    // ------------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------------

    private static String str(PluginCall call, String key) {
        String v = call.getString(key, "");
        return v == null ? "" : v.trim();
    }

    private static String normalizeNumber(String number) {
        return number == null ? "" : number.replaceAll("[^\\d]", "");
    }

    private static final class DataMatch {
        final String dataId;
        final String rawId;

        DataMatch(String dataId, String rawId) {
            this.dataId = dataId;
            this.rawId = rawId;
        }
    }

    private DataMatch findPhoneMatch(String digits) {
        try (Cursor c = cr().query(ContactsContract.Data.CONTENT_URI,
                new String[]{ContactsContract.Data._ID, ContactsContract.Data.RAW_CONTACT_ID,
                        ContactsContract.CommonDataKinds.Phone.NUMBER,
                        ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER},
                ContactsContract.Data.MIMETYPE + " = ?",
                new String[]{ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE}, null)) {
            while (c != null && c.moveToNext()) {
                String number = c.getString(c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER));
                String normalized = c.getString(c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER));
                if (matchesPhone(number, normalized, digits)) {
                    return new DataMatch(
                            c.getString(c.getColumnIndexOrThrow(ContactsContract.Data._ID)),
                            c.getString(c.getColumnIndexOrThrow(ContactsContract.Data.RAW_CONTACT_ID)));
                }
            }
        }
        return null;
    }

    /** Matches a phone stored as NUMBER and/or NORMALIZED_NUMBER against digit-only E.164. */
    private static boolean matchesPhone(String number, String normalized, String digits) {
        if (number != null && !normalizeNumber(number).isEmpty() && normalizeNumber(number).equals(digits)) {
            return true;
        }
        return normalized != null
                && !normalizeNumber(normalized).isEmpty()
                && normalizeNumber(normalized).equals(digits);
    }

    private void updatePhoneData(String dataId, String display, String e164) {
        ContentValues v = new ContentValues();
        v.put(ContactsContract.CommonDataKinds.Phone.NUMBER, display);
        v.put(ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER, e164);
        cr().update(ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, Long.parseLong(dataId)), v, null, null);
    }

    private void upsertStructuredName(String rawId, String given, String family) {
        String existing = findDataRow(rawId, ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE);
        if (existing != null) {
            ContentValues v = new ContentValues();
            v.put(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, trimJoin(given, family));
            v.put(ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME, given);
            v.put(ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME, family);
            cr().update(ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, Long.parseLong(existing)), v, null, null);
        } else {
            insertRow(ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE, rawId,
                    new Value(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, trimJoin(given, family)),
                    new Value(ContactsContract.CommonDataKinds.StructuredName.GIVEN_NAME, given),
                    new Value(ContactsContract.CommonDataKinds.StructuredName.FAMILY_NAME, family));
        }
    }

    private void upsertEmail(String rawId, String email) {
        String existing = findDataRow(rawId, ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE);
        if (email == null || email.isEmpty()) {
            if (existing != null) {
                cr().delete(ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, Long.parseLong(existing)), null, null);
            }
            return;
        }
        if (existing != null) {
            ContentValues v = new ContentValues();
            v.put(ContactsContract.CommonDataKinds.Email.ADDRESS, email);
            cr().update(ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, Long.parseLong(existing)), v, null, null);
        } else {
            insertRow(ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE, rawId,
                    new Value(ContactsContract.CommonDataKinds.Email.ADDRESS, email),
                    new Value(ContactsContract.CommonDataKinds.Email.TYPE, ContactsContract.CommonDataKinds.Email.TYPE_WORK),
                    new Value(ContactsContract.CommonDataKinds.Email.LABEL, "work"),
                    new Value(ContactsContract.CommonDataKinds.Email.IS_PRIMARY, 1));
        }
    }

    private void upsertNote(String rawId, String note) {
        String existing = findDataRow(rawId, ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE);
        if (note == null || note.isEmpty()) {
            if (existing != null) {
                cr().delete(ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, Long.parseLong(existing)), null, null);
            }
            return;
        }
        if (existing != null) {
            ContentValues v = new ContentValues();
            v.put(ContactsContract.CommonDataKinds.Note.NOTE, note);
            cr().update(ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, Long.parseLong(existing)), v, null, null);
        } else {
            insertRow(ContactsContract.CommonDataKinds.Note.CONTENT_ITEM_TYPE, rawId,
                    new Value(ContactsContract.CommonDataKinds.Note.NOTE, note));
        }
    }

    private String findDataRow(String rawId, String mimeType) {
        try (Cursor c = cr().query(ContactsContract.Data.CONTENT_URI,
                new String[]{ContactsContract.Data._ID},
                ContactsContract.Data.RAW_CONTACT_ID + " = ? AND " + ContactsContract.Data.MIMETYPE + " = ?",
                new String[]{rawId, mimeType}, null)) {
            if (c != null && c.moveToFirst()) {
                return c.getString(c.getColumnIndexOrThrow(ContactsContract.Data._ID));
            }
        }
        return null;
    }

    private void insertRow(String mimeType, String rawId, Value... fields) {
        ContentValues v = new ContentValues();
        v.put(ContactsContract.Data.RAW_CONTACT_ID, Long.parseLong(rawId));
        v.put(ContactsContract.Data.MIMETYPE, mimeType);
        for (Value f : fields) {
            if (f.value instanceof Integer) {
                v.put(f.column, (Integer) f.value);
            } else {
                v.put(f.column, (String) f.value);
            }
        }
        cr().insert(ContactsContract.Data.CONTENT_URI, v);
    }

    private String readContactId(String rawId) {
        try (Cursor c = cr().query(ContactsContract.RawContacts.CONTENT_URI,
                new String[]{ContactsContract.RawContacts.CONTACT_ID},
                ContactsContract.RawContacts._ID + " = ?", new String[]{rawId}, null)) {
            if (c != null && c.moveToFirst()) {
                return c.getString(c.getColumnIndexOrThrow(ContactsContract.RawContacts.CONTACT_ID));
            }
        }
        return rawId;
    }

    private String[] readRawAccount(String rawId) {
        String[] acct = new String[]{null, null};
        try (Cursor c = cr().query(ContactsContract.RawContacts.CONTENT_URI,
                new String[]{ContactsContract.RawContacts.ACCOUNT_TYPE, ContactsContract.RawContacts.ACCOUNT_NAME},
                ContactsContract.RawContacts._ID + " = ?", new String[]{rawId}, null)) {
            if (c != null && c.moveToFirst()) {
                acct[0] = c.getString(c.getColumnIndexOrThrow(ContactsContract.RawContacts.ACCOUNT_TYPE));
                acct[1] = c.getString(c.getColumnIndexOrThrow(ContactsContract.RawContacts.ACCOUNT_NAME));
            }
        }
        return acct;
    }

    private static String trimJoin(String a, String b) {
        return (a + " " + b).trim();
    }

    private static final class Value {
        final String column;
        final Object value;

        Value(String column, Object value) {
            this.column = column;
            this.value = value;
        }
    }
}