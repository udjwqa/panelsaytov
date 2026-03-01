import axios from 'axios';
import { decrypt } from '../utils/crypto';

interface CloudflareConfig {
  zoneId: string;
  apiToken: string;
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${decrypt(token)}`,
    'Content-Type': 'application/json',
  };
}

export async function testCloudflareConnection(config: CloudflareConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await axios.get(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}`, {
      headers: getHeaders(config.apiToken),
    });
    return { success: res.data.success };
  } catch (error: any) {
    return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
  }
}

export async function getDnsRecords(config: CloudflareConfig, domain: string) {
  const res = await axios.get(
    `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records?name=${domain}&type=A`,
    { headers: getHeaders(config.apiToken) }
  );
  return res.data.result || [];
}

export async function setDnsRecord(config: CloudflareConfig, domain: string, ip: string): Promise<void> {
  const existing = await getDnsRecords(config, domain);

  if (existing.length > 0) {
    // Update existing A record
    await axios.put(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records/${existing[0].id}`,
      { type: 'A', name: domain, content: ip, proxied: true, ttl: 1 },
      { headers: getHeaders(config.apiToken) }
    );
  } else {
    // Create new A record
    await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records`,
      { type: 'A', name: domain, content: ip, proxied: true, ttl: 1 },
      { headers: getHeaders(config.apiToken) }
    );
  }
}

export async function deleteDnsRecord(config: CloudflareConfig, domain: string): Promise<void> {
  const existing = await getDnsRecords(config, domain);
  for (const record of existing) {
    await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/dns_records/${record.id}`,
      { headers: getHeaders(config.apiToken) }
    );
  }
}
