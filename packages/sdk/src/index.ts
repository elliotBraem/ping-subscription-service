import {
  Subscription,
  WorkerStatus,
  Merchant,
  MonitoringStatus,
} from "@ping-subscription/types";

import * as nearAPI from "near-api-js";
const { KeyPair, utils } = nearAPI;

export * from "./utils/collateral.js";
export * from "./utils/near-provider.js";
export * from "./utils/shade-agent.js";
export * from "./utils/tappd.js";

/**
 * SDK configuration options
 */
export interface SubscriptionSDKOptions {
  /**
   * API URL for the subscription service
   * @default 'http://localhost:3000'
   */
  apiUrl?: string;
}

/**
 * Subscription creation parameters
 */
export interface CreateSubscriptionParams {
  /**
   * Merchant ID
   */
  merchantId: string;

  /**
   * Subscription amount in yoctoNEAR (10^-24 NEAR)
   */
  amount: string;

  /**
   * Subscription frequency in seconds
   */
  frequency: number;

  /**
   * Maximum number of payments (optional)
   */
  maxPayments?: number;

  /**
   * Token address for FT payments (optional)
   */
  tokenAddress?: string;
}

/**
 * Subscription SDK for interacting with the Ping Subscription Service
 */
export class SubscriptionSDK {
  private apiUrl: string;

  /**
   * Create a new SubscriptionSDK instance
   * @param options SDK configuration options
   */
  constructor(options: SubscriptionSDKOptions = {}) {
    this.apiUrl = options.apiUrl || "http://localhost:3000";
  }

  /**
   * Check if the worker is verified
   * @returns Worker status
   */
  async isWorkerVerified(): Promise<WorkerStatus> {
    const response = await fetch(`${this.apiUrl}/api/isVerified`);
    return await response.json();
  }

  /**
   * Get worker account ID
   * @returns Worker status with account ID
   */
  async getWorkerAccount(): Promise<WorkerStatus> {
    const response = await fetch(`${this.apiUrl}/api/derive`);
    return await response.json();
  }

  /**
   * Register worker with the contract
   * @returns Worker status with registration result
   */
  async registerWorker(): Promise<WorkerStatus> {
    const response = await fetch(`${this.apiUrl}/api/register`);
    return await response.json();
  }

  /**
   * Get all merchants
   * @returns List of merchants
   */
  async getMerchants(): Promise<{ merchants: Merchant[] }> {
    const response = await fetch(`${this.apiUrl}/api/merchants`);
    return await response.json();
  }

  /**
   * Create a new subscription
   * @param params Subscription creation parameters
   * @returns Subscription creation result
   */
  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<{ success: boolean; subscriptionId: string }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "create",
        merchantId: params.merchantId,
        amount: params.amount,
        frequency: params.frequency,
        maxPayments: params.maxPayments,
        tokenAddress: params.tokenAddress,
      }),
    });
    return await response.json();
  }

  /**
   * Create a function call access key for a subscription
   * This generates a transaction that the user needs to sign to create the key
   * @param accountId The user's account ID
   * @param subscriptionId The subscription ID
   * @param contractId The contract ID
   * @param allowance The maximum allowance for the key (in yoctoNEAR)
   * @returns The transaction to sign and the generated key pair
   */
  createSubscriptionKeyTransaction(
    accountId: string,
    subscriptionId: string,
    contractId: string,
    allowance: string = "250000000000000000000000", // 0.25 NEAR default
  ): {
    transaction: any;
    keyPair: { publicKey: string; privateKey: string };
  } {
    // Generate a new key pair
    const keyPair = KeyPair.fromRandom("ed25519");
    const publicKey = keyPair.getPublicKey().toString();
    const privateKey = keyPair.toString();

    // Create a transaction to add the function call access key
    // This will allow the key to only call the process_payment method on the contract
    // with a specific allowance
    const transaction = {
      receiverId: accountId,
      actions: [
        {
          type: "AddKey",
          params: {
            publicKey: publicKey,
            accessKey: {
              nonce: 0,
              permission: {
                type: "FunctionCall",
                methodNames: ["process_payment"],
                contractId: contractId,
                allowance: allowance,
              },
            },
          },
        },
      ],
    };

    return {
      transaction,
      keyPair: {
        publicKey,
        privateKey,
      },
    };
  }

  /**
   * Register a subscription key with the contract
   * @param subscriptionId The subscription ID
   * @param publicKey The public key to register
   * @returns Operation result
   */
  async registerSubscriptionKey(
    subscriptionId: string,
    publicKey: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "registerKey",
        subscriptionId,
        publicKey,
      }),
    });
    return await response.json();
  }

  /**
   * Store a private key for a subscription in the TEE
   * @param subscriptionId The subscription ID
   * @param privateKey The private key to store
   * @param publicKey The public key
   * @returns Operation result
   */
  async storeSubscriptionKey(
    subscriptionId: string,
    privateKey: string,
    publicKey: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.apiUrl}/api/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "store",
        subscriptionId,
        privateKey,
        publicKey,
      }),
    });
    return await response.json();
  }

  /**
   * Get a subscription by ID
   * @param subscriptionId Subscription ID
   * @returns Subscription details
   */
  async getSubscription(
    subscriptionId: string,
  ): Promise<{ subscription: Subscription }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "get",
        subscriptionId,
      }),
    });
    return await response.json();
  }

  /**
   * Get all subscriptions for a user
   * @param accountId User account ID
   * @returns List of subscriptions
   */
  async getUserSubscriptions(
    accountId: string,
  ): Promise<{ subscriptions: Subscription[] }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "list",
        accountId,
      }),
    });
    return await response.json();
  }

  /**
   * Pause a subscription
   * @param subscriptionId Subscription ID
   * @returns Operation result
   */
  async pauseSubscription(
    subscriptionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "pause",
        subscriptionId,
      }),
    });
    return await response.json();
  }

  /**
   * Resume a paused subscription
   * @param subscriptionId Subscription ID
   * @returns Operation result
   */
  async resumeSubscription(
    subscriptionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "resume",
        subscriptionId,
      }),
    });
    return await response.json();
  }

  /**
   * Cancel a subscription
   * @param subscriptionId Subscription ID
   * @returns Operation result
   */
  async cancelSubscription(
    subscriptionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.apiUrl}/api/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "cancel",
        subscriptionId,
      }),
    });
    return await response.json();
  }

  /**
   * Start monitoring subscriptions
   * @param interval Monitoring interval in milliseconds (default: 60000)
   * @returns Operation result
   */
  async startMonitoring(
    interval?: number,
  ): Promise<{ success: boolean; message: string; isMonitoring: boolean }> {
    const response = await fetch(`${this.apiUrl}/api/monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "start",
        interval,
      }),
    });
    return await response.json();
  }

  /**
   * Stop monitoring subscriptions
   * @returns Operation result
   */
  async stopMonitoring(): Promise<{
    success: boolean;
    message: string;
    isMonitoring: boolean;
  }> {
    const response = await fetch(`${this.apiUrl}/api/monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "stop",
      }),
    });
    return await response.json();
  }

  /**
   * Get monitoring status
   * @returns Monitoring status
   */
  async getMonitoringStatus(): Promise<MonitoringStatus> {
    const response = await fetch(`${this.apiUrl}/api/monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "status",
      }),
    });
    return await response.json();
  }
}

// Export default instance
export default SubscriptionSDK;
